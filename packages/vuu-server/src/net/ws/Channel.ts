import type { WebsocketData } from "@heswell/service-utils/browser";

/**
 * One client connection, as seen by the request handlers. A Bun
 * ServerWebSocket satisfies it, and so does any in-process transport
 * (e.g. a MessagePort in a browser worker).
 */
export interface Channel {
  readonly data: WebsocketData;
  send(message: string): unknown;
  close(code?: number, reason?: string): void;
}
