import type { WebsocketData } from "@heswell/service-utils/browser";
import type { Channel } from "../net/ws/Channel";

/** Paths to a PEM certificate and key. The runtime reads the files. */
export type TlsFiles = {
  certPath: string;
  keyPath: string;
};

export type ServeHttpOptions = {
  /** Port to listen on; 0 for an ephemeral port. */
  port: number;
  tls?: TlsFiles;
  /** Answers a request. undefined means 404. */
  fetch: (req: Request) => Promise<Response | undefined> | Response | undefined;
};

export type ServeWebSocketOptions = {
  /** Port to listen on; 0 for an ephemeral port. */
  port: number;
  /** URL path that accepts websocket upgrades. Anything else gets a 404. */
  path: string;
  tls?: TlsFiles;
  /** Largest message accepted, in bytes. */
  maxPayloadLength: number;
  /** Seconds without traffic (pings count) before a connection is closed. */
  idleTimeoutSeconds: number;
  /** Called once per connection, before it opens. */
  createData: () => WebsocketData;
  open: (channel: Channel) => void;
  message: (channel: Channel, message: string) => void | Promise<void>;
  close: (channel: Channel, code: number, reason: string) => void;
};

export interface RunningServer {
  readonly hostname: string;
  readonly port: number;
  /** Stops listening and closes open connections. */
  stop(): Promise<void>;
}

export interface YamlCodec {
  parse(text: string): unknown;
  stringify(value: unknown): string;
}

/**
 * The platform services a Vuu server needs: HTTP and websocket listeners,
 * and YAML. Bun is built in (bunRuntime); @heswell/vuu-server-node provides
 * one for Node.js.
 */
export interface ServerRuntime {
  readonly name: string;
  serveHttp(options: ServeHttpOptions): Promise<RunningServer>;
  serveWebSocket(options: ServeWebSocketOptions): Promise<RunningServer>;
  readonly yaml: YamlCodec;
}
