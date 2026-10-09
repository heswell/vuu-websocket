import type { Server, ServerWebSocket } from "bun";
import type { ClientMessage } from "./protocol";
import { isSubscribeRequest } from "./protocol";
import type { RateGenerator } from "./RateGenerator";
import type { TablePublisher } from "./TablePublisher";

/**
 * Anything with a lifecycle the service should manage, typically a
 * RemoteTableSubscription to an upstream service.
 */
export interface ServiceDependency {
  readonly health: unknown;
  start(): unknown;
  stop(): void;
}

export interface DataServiceOptions {
  /** How often pending updates are published, default 100ms */
  flushInterval?: number;
  /** Interval between heartbeats, 0 disables, default 30s */
  heartbeatInterval?: number;
  hostname?: string;
  log?: (message: string) => void;
  /** Max bytes buffered on a socket, beyond which it is closed, default 16MB */
  maxBufferedBytes?: number;
  name: string;
  port: number;
  routes?: Record<string, (url: URL) => Response | Promise<Response>>;
}

interface SessionData {
  awaitingHeartbeat: boolean;
  id: number;
  subscriptions: Set<TablePublisher>;
}

type Socket = ServerWebSocket<SessionData>;

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: CORS_HEADERS });

/**
 * Hosts one or more TablePublishers over a WebSocket, with optional
 * RateGenerators and upstream dependencies.
 *
 * The service listens as soon as it starts, regardless of the state of its
 * dependencies. Publishers that depend on upstream data should be created
 * with ready: false and have setReady invoked once that data is available,
 * subscribers are queued until then.
 *
 * HTTP routes
 *   GET /health                         publishers, dependencies, generators
 *   GET /admin/start?generator=x&rate=n start (or change rate of) a generator
 *   GET /admin/stop?generator=x         stop a generator
 * If there is just one generator, the generator param can be omitted.
 */
export class DataService {
  readonly name: string;

  #dependencies: ServiceDependency[] = [];
  #flushInterval: number;
  #flushTimer: Timer | undefined;
  #generators = new Map<string, RateGenerator>();
  #heartbeatInterval: number;
  #heartbeatTimer: Timer | undefined;
  #hostname: string | undefined;
  #log: (message: string) => void;
  #maxBufferedBytes: number;
  #nextSessionId = 1;
  #port: number;
  #publishers = new Map<string, TablePublisher>();
  #routes: NonNullable<DataServiceOptions["routes"]>;
  #server: Server<SessionData> | undefined;
  #sockets = new Set<Socket>();

  constructor({
    flushInterval = 100,
    heartbeatInterval = 30_000,
    hostname,
    log,
    maxBufferedBytes = 16 * 1024 * 1024,
    name,
    port,
    routes = {},
  }: DataServiceOptions) {
    this.name = name;
    this.#flushInterval = flushInterval;
    this.#heartbeatInterval = heartbeatInterval;
    this.#hostname = hostname;
    this.#maxBufferedBytes = maxBufferedBytes;
    this.#port = port;
    this.#routes = routes;
    const logger = log ?? console.log;
    this.#log = (message) => logger(`[${name}] ${message}`);
  }

  get port() {
    return this.#server?.port ?? this.#port;
  }

  get url() {
    return `ws://${this.#hostname ?? "localhost"}:${this.port}`;
  }

  get sessionCount() {
    return this.#sockets.size;
  }

  get health() {
    return {
      name: this.name,
      sessions: this.#sockets.size,
      publishers: Array.from(this.#publishers.values(), (p) => p.status),
      generators: Array.from(this.#generators.values(), (g) => g.status),
      dependencies: this.#dependencies.map((d) => d.health),
    };
  }

  addPublisher(publisher: TablePublisher) {
    if (this.#publishers.has(publisher.resource)) {
      throw Error(
        `[${this.name}] duplicate publisher resource ${publisher.resource}`,
      );
    }
    this.#publishers.set(publisher.resource, publisher);
    return this;
  }

  addGenerator(generator: RateGenerator) {
    this.#generators.set(generator.name, generator);
    return this;
  }

  addDependency(dependency: ServiceDependency) {
    this.#dependencies.push(dependency);
    return this;
  }

  getGenerator(name: string) {
    return this.#generators.get(name);
  }

  start() {
    if (this.#server) {
      return this;
    }
    this.#server = Bun.serve<SessionData>({
      hostname: this.#hostname,
      port: this.#port,
      fetch: (req, server) => {
        if (
          req.headers.get("upgrade")?.toLowerCase() === "websocket" &&
          server.upgrade(req, {
            data: {
              awaitingHeartbeat: false,
              id: this.#nextSessionId++,
              subscriptions: new Set(),
            },
          })
        ) {
          return undefined;
        }
        return this.#handleHttp(new URL(req.url));
      },
      websocket: {
        backpressureLimit: this.#maxBufferedBytes,
        closeOnBackpressureLimit: true,
        open: (ws) => {
          this.#sockets.add(ws);
        },
        message: (ws, message) => this.#handleMessage(ws, message),
        drain: (ws) => {
          for (const publisher of ws.data.subscriptions) {
            publisher.onDrain(ws);
          }
        },
        close: (ws) => {
          this.#sockets.delete(ws);
          for (const publisher of ws.data.subscriptions) {
            publisher.unsubscribe(ws);
          }
          ws.data.subscriptions.clear();
        },
      },
    });

    this.#flushTimer = setInterval(() => this.flush(), this.#flushInterval);
    if (this.#heartbeatInterval > 0) {
      this.#heartbeatTimer = setInterval(
        () => this.#heartbeat(),
        this.#heartbeatInterval,
      );
    }
    this.#log(`listening on ${this.url}`);

    for (const dependency of this.#dependencies) {
      dependency.start();
    }
    return this;
  }

  /**
   * Publish pending updates from all publishers, invoked on a timer.
   */
  flush() {
    for (const publisher of this.#publishers.values()) {
      publisher.flush();
    }
  }

  async stop() {
    clearInterval(this.#flushTimer);
    clearInterval(this.#heartbeatTimer);
    this.#flushTimer = this.#heartbeatTimer = undefined;
    for (const generator of this.#generators.values()) {
      generator.stop();
    }
    for (const dependency of this.#dependencies) {
      dependency.stop();
    }
    for (const publisher of this.#publishers.values()) {
      publisher.dispose();
    }
    const server = this.#server;
    this.#server = undefined;
    if (server) {
      for (const ws of this.#sockets) {
        ws.close(1001, "service stopping");
      }
      this.#sockets.clear();
      // The listener closes synchronously. The returned promise may not
      // settle while clients are attempting to reconnect, so is not awaited.
      void server.stop(true);
    }
  }

  #send(ws: Socket, message: object) {
    ws.send(JSON.stringify(message));
  }

  #handleMessage(ws: Socket, raw: string | Buffer) {
    let message: ClientMessage;
    try {
      message = JSON.parse(String(raw));
    } catch {
      this.#send(ws, { type: "error", message: "invalid JSON" });
      return;
    }

    if (message.type === "HB") {
      ws.data.awaitingHeartbeat = false;
      return;
    }

    const { resource } = message;
    const publisher = this.#publishers.get(resource);
    if (publisher === undefined) {
      this.#send(ws, {
        type: "error",
        resource,
        message: `unknown resource '${resource}'`,
      });
      return;
    }

    if (message.type === "unsubscribe") {
      publisher.unsubscribe(ws);
      ws.data.subscriptions.delete(publisher);
    } else if (isSubscribeRequest(message.type) || message.type === "snapshot") {
      try {
        ws.data.subscriptions.add(publisher);
        publisher.subscribe(ws, {
          columns: message.columns,
          mode: message.type === "snapshot" ? "snapshot" : "subscribe",
        });
      } catch (err) {
        ws.data.subscriptions.delete(publisher);
        this.#send(ws, {
          type: "error",
          resource,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      this.#send(ws, {
        type: "error",
        resource,
        message: `unsupported request type '${(message as { type: string }).type}'`,
      });
    }
  }

  #heartbeat() {
    const ts = Date.now();
    const hb = JSON.stringify({ type: "HB", ts });
    for (const ws of this.#sockets) {
      if (ws.data.awaitingHeartbeat) {
        this.#log(`session #${ws.data.id} missed heartbeat, closing`);
        ws.close(4000, "heartbeat timeout");
      } else {
        ws.data.awaitingHeartbeat = true;
        ws.send(hb);
      }
    }
  }

  #resolveGenerator(url: URL): RateGenerator | Response {
    const name = url.searchParams.get("generator");
    if (name) {
      return (
        this.#generators.get(name) ??
        json({ error: `unknown generator '${name}'` }, 404)
      );
    }
    if (this.#generators.size === 1) {
      return this.#generators.values().next().value as RateGenerator;
    }
    return json(
      {
        error: "generator param required",
        generators: Array.from(this.#generators.keys()),
      },
      400,
    );
  }

  #handleHttp(url: URL): Response | Promise<Response> {
    const custom = this.#routes[url.pathname];
    if (custom) {
      return custom(url);
    }
    switch (url.pathname) {
      case "/health":
        return json(this.health);
      case "/admin/start": {
        const generator = this.#resolveGenerator(url);
        if (generator instanceof Response) {
          return generator;
        }
        const rateValue =
          url.searchParams.get("rate") ??
          (generator.rateParam
            ? url.searchParams.get(generator.rateParam)
            : null);
        const rate = rateValue === null ? undefined : Number(rateValue);
        try {
          generator.start(rate);
          this.#log(`${generator.name} started, ${generator.ratePerSecond}/s`);
          return json(generator.status);
        } catch (err) {
          return json({ error: String(err) }, 400);
        }
      }
      case "/admin/stop": {
        const generator = this.#resolveGenerator(url);
        if (generator instanceof Response) {
          return generator;
        }
        generator.stop();
        this.#log(`${generator.name} stopped`);
        return json(generator.status);
      }
      default:
        return json({ error: `not found ${url.pathname}` }, 404);
    }
  }
}
