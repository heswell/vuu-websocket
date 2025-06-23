import {
  IDequeue,
  MessageQueue,
  ResourceMessage,
  WebSocketSink,
  type WebsocketData,
} from "@heswell/service-utils";
import { ServerWebSocket } from "bun";
import logger from "./logger";

export interface ISession<T extends object> {
  addViewport: (viewportId: string) => void;
  clear: () => void;
  kill: () => void;
  readQueue: () => null | T[];
  sendHeartBeat: () => void;
  readonly id: string;
  readonly clientUnresponsive?: boolean;
  readonly outgoingHeartbeat?: number;
  readonly viewports: string[];
  readonly stream: WritableStream;
  readonly ws: ServerWebSocket<WebsocketData>;
}

export class SessionContainer {
  #sessions = new Map<string, ISession<ResourceMessage>>();
  constructor(
    private messageQueue: IDequeue<ResourceMessage>,
    private loggingContext = "service-utils"
  ) {}

  #stopHeartbeats: undefined | (() => void);
  #stopMainLoop: undefined | (() => void);

  startHeartBeats(updateFrequency = 250) {
    console.log(`[${this.loggingContext}:SessionContainer] start heartbeats`);
    return this.heartbeatLoop(updateFrequency);
  }
  startMainUpdateLoop(updateFrequency = 250) {
    console.log(
      `[${this.loggingContext}:SessionContainer] start main update loop frequency ${updateFrequency}ms`
    );
    return this.mainUpdateLoop(updateFrequency);
  }

  heartbeatLoop = (interval = 60_000) => {
    logger.info(
      `[${this.loggingContext}:SessionContainer] heartbeatLoop loop @  ${interval}ms`
    );

    let _keepGoing = true;
    let _timer: Timer | null = null;

    const tick = () => {
      console.log(
        `[${this.loggingContext}:SessionContainer] heartbeat tick (${
          this.#sessions.size
        } sessions)`
      );
      const expiredSessions: ISession<ResourceMessage>[] = [];
      for (const session of this.#sessions.values()) {
        if (session.clientUnresponsive) {
          expiredSessions.push(session);
        } else {
          session.sendHeartBeat();
        }
      }

      expiredSessions.forEach((session) => {
        session.kill();
        this.clearSession(session.id);
      });

      if (_keepGoing) {
        _timer = setTimeout(tick, interval);
      }
    };

    tick();

    const stopper = () => {
      console.log(
        `[${this.loggingContext}:service:SessionContainer] stopping heartbeat updateLoop`
      );
      if (_timer) {
        clearTimeout(_timer);
      }
      _keepGoing = false;
    };

    return stopper;
  };

  mainUpdateLoop = (interval = 250) => {
    // TODO
    let _keepGoing = true;
    let _timer: Timer | null = null;

    const tick = () => {
      // console.log(`update loops tick (${sessions.size} sessions)`);
      const start = performance.now();
      if (this.messageQueue.hasUpdates) {
        const messages = this.messageQueue.dequeueAllMessages();
        console.log(
          `[${this.loggingContext}:SessionContainer] ${messages.length} messages dequeued from Store`
        );

        if (this.#sessions.size === 0) {
          logger.info(
            `[${this.loggingContext}:SessionContainer] no open sessions`
          );
        }

        for (const session of this.#sessions.values()) {
          // const readStream = new ReadableStream(
          //   new ArrayDataStreamSource(session.id, messages, {
          //     type: "insert",
          //     tableName: "parentOrders",
          //   })
          // );
          // readStream.pipeTo(session.stream);
          // for (const message of messages) {
          session.ws.send(JSON.stringify(messages));
          // }
        }

        const end = performance.now();
        console.log(
          `[${this.loggingContext}:SessionContainer] ${
            messages.length
          } queued messages took ${end - start}ms`
        );
      } else {
        // console.log(
        //   `[${this.loggingContext}:SessionContainer] no messages to dequeue from Store`
        // );
      }

      if (_keepGoing) {
        _timer = setTimeout(tick, interval);
      }
    };

    tick();

    const stopper = () => {
      console.log(
        `[${this.loggingContext}:SessionContainer] stopping updateLoop`
      );
      if (_timer) {
        clearTimeout(_timer);
      }
      _keepGoing = false;
    };

    return stopper;
  };

  createSession(sessionId: string, ws: ServerWebSocket<WebsocketData>) {
    this.#sessions.set(sessionId, new Session<ResourceMessage>(sessionId, ws));
    if (this.#sessions.size === 1) {
      this.#stopMainLoop = this.startMainUpdateLoop(100);
      this.#stopHeartbeats = this.startHeartBeats(180_000);
    }
  }

  clearSession(sessionId: string) {
    const session = this.#sessions.get(sessionId);
    if (session) {
      session.clear();
      this.#sessions.delete(sessionId);
    }
    if (this.#sessions.size === 0) {
      this.#stopMainLoop?.();
      this.#stopHeartbeats?.();
    }
    return this.#sessions.size;
  }

  getSession<T extends object>(
    sessionId: string,
    throwIfUndefined: true
  ): ISession<T>;
  getSession<T extends object>(
    sessionId: string,
    throwIfUndefined?: false
  ): ISession<T> | undefined;
  getSession(sessionId: string, throwIfUndefined?: boolean) {
    const session = this.#sessions.get(sessionId);
    if (session) {
      return session;
    } else if (throwIfUndefined) {
      throw Error(
        `[${this.loggingContext}:SessionContainer] session not found #${sessionId}`
      );
    }
  }
}

class Session<T extends object> implements ISession<T> {
  #heartbeat = 0;
  #heatbeatResponseReceived = true;
  #id: string;
  #user: string | undefined;
  #ws: ServerWebSocket<WebsocketData>;
  #stream: WritableStream;
  #token: string | undefined;
  #queue: MessageQueue<T>;
  #viewports: string[] = [];

  // #stopUpdates: () => void;
  constructor(sessionId: string, ws: ServerWebSocket<WebsocketData>) {
    this.#id = sessionId;
    this.#ws = ws;
    this.#queue = new MessageQueue();
    this.#stream = new WritableStream(new WebSocketSink(sessionId, ws));

    // this.#stopUpdates = updateLoop(
    //   "Regular Updates",
    //   ws,
    //   config.CLIENT_UPDATE_FREQUENCY,
    //   this.queueReader
    // );
    console.log(`new session created sessionId ${this.#id}`);
  }

  clear() {
    this.#queue.length = 0;
  }

  get id() {
    return this.#id;
  }
  get messageQueue() {
    return this.#queue;
  }

  get stream() {
    // TODO create lazily
    return this.#stream;
  }

  set incomingHeartbeat(hb: number) {
    const latency = hb - this.#heartbeat;
    this.#heatbeatResponseReceived = true;
    console.log(`[:service:Session] incoming HB, latency ${latency}`);
  }

  set outgoingHeartbeat(hb: number) {
    this.#heartbeat = hb;
    this.#heatbeatResponseReceived = false;
  }

  /**
   * No HeartBeat response from client. This will be called just before the next outgoing heartbeat is sent.
   */
  get clientUnresponsive() {
    return this.#heatbeatResponseReceived === false;
  }

  get viewports() {
    return this.#viewports;
  }

  get ws() {
    return this.#ws;
  }

  addViewport(viewportId: string) {
    this.#viewports.push(viewportId);
  }

  removeViewport(viewportId: string) {
    const index = this.#viewports.indexOf(viewportId);
    if (index !== -1) {
      this.#viewports.splice(index, 1);
    }
  }

  readQueue = () => {
    const queue = this.#queue.extractAll();
    if (queue.length > 0) {
      return queue;
    } else {
      return null;
    }
  };

  sendHeartBeat() {
    const ts = Date.now();
    this.outgoingHeartbeat = ts;
    this.#ws.send(`{"type":"HB", "ts": ${ts} }`);
  }

  kill() {
    console.log(`[:service:Session] #${this.id} KILL`);
    this.#ws.close();
  }
}
