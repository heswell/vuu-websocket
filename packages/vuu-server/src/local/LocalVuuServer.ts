import type { LoginSuccessProvider } from "../core/LoginSuccessProvider";
import type { ViewServerModule } from "../core/module/VsModule";
import { VuuServerCore } from "../core/VuuServerCore";
import type { SessionLimitPolicy } from "../net/ClientSessionContainer";
import type { LoginTokenService } from "../net/auth/LoginTokenService";
import { LocalLoginTokenService } from "../net/auth/LocalLoginTokenService";
import { LifecycleContainer } from "../toolbox/thread/LifecycleContainer";
import {
  acceptConnections,
  serveMessagePort,
  type StopServing,
} from "./MessagePortTransport";
import type { MessageSource } from "./protocol";

export interface LocalVuuServerOptions {
  modules: ViewServerModule[];
  /** Default: LocalLoginTokenService, which logs in any named user. */
  loginTokenService?: LoginTokenService;
  loginSuccessProvider?: LoginSuccessProvider;
  /**
   * Send heartbeats and drop clients that stop answering them. Default true,
   * as for a remote server, so the client's heartbeat handling is exercised.
   */
  heartbeat?: boolean;
  /** Default: unlimited, so tests can open several connections as one user. */
  maxSessionsPerUser?: number;
  sessionLimitPolicy?: SessionLimitPolicy;
}

export interface LocalVuuServer {
  readonly server: VuuServerCore;
  readonly lifecycle: LifecycleContainer;
  /** Starts providers, modules and the session runner. */
  start(): Promise<void>;
  /** Closes all connections, then stops the server. */
  stop(): Promise<void>;
  /**
   * Accept connections from a connector, typically `self` in the server's
   * worker. See `openPortVia` for the client side.
   */
  acceptConnections(connector: MessageSource): StopServing;
  /**
   * A new connection served in the same thread; returns the client's port.
   * Pass to `createLocalWebSocketClass` to run client and server together.
   */
  openPort(): MessagePort;
}

/**
 * A Vuu server with no network transport, for a browser or Web Worker:
 * clients connect over MessagePorts and speak the normal Vuu protocol (JSON
 * text), so the whole client stack is exercised as against a remote server.
 */
export function createLocalVuuServer({
  heartbeat = true,
  loginSuccessProvider,
  loginTokenService = LocalLoginTokenService(),
  maxSessionsPerUser = Number.MAX_SAFE_INTEGER,
  modules,
  sessionLimitPolicy,
}: LocalVuuServerOptions): LocalVuuServer {
  const lifecycle = new LifecycleContainer();
  const server = new VuuServerCore(
    {
      heartbeat,
      loginSuccessProvider,
      loginTokenService,
      maxSessionsPerUser,
      modules,
      sessionLimitPolicy,
    },
    lifecycle,
  );
  const handler = server.createHandler();
  const transports = new Set<StopServing>();

  const track = (stop: StopServing): StopServing => {
    const tracked = () => {
      transports.delete(tracked);
      stop();
    };
    transports.add(tracked);
    return tracked;
  };

  return {
    server,
    lifecycle,
    start: () => lifecycle.start(),
    async stop() {
      [...transports].forEach((stop) => stop());
      await lifecycle.stop();
    },
    acceptConnections: (connector) =>
      track(acceptConnections(handler, connector)),
    openPort() {
      const { port1, port2 } = new MessageChannel();
      const stop: StopServing = track(
        serveMessagePort(handler, port2, () => transports.delete(stop)),
      );
      return port1;
    },
  };
}
