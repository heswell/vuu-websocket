/**
 * Messages for running a Vuu server behind MessagePorts instead of a
 * WebSocket, e.g. in a Web Worker.
 *
 * - A "connector" (a Worker, a worker's global scope or a MessagePort)
 *   carries one kind of message, `vuu-connect`, which hands the server a new
 *   MessagePort. Each port is one client connection, like one WebSocket.
 * - On a connection port, strings are Vuu protocol messages, exactly the
 *   text that would travel over a WebSocket. Objects are control messages.
 */

export const VUU_CONNECT = "vuu-connect";
export const VUU_CLOSE = "vuu-close";

/** Sent on a connector: open a connection served on `port`. */
export interface VuuConnectMessage {
  type: typeof VUU_CONNECT;
  port: MessagePort;
}

/** Sent on a connection port, by either side: the connection is closed. */
export interface VuuCloseMessage {
  type: typeof VUU_CLOSE;
  code?: number;
  reason?: string;
}

/** Anything messages can be posted to with transferables. */
export interface PostMessageTarget {
  postMessage(message: unknown, transfer: Transferable[]): void;
}

/** Anything that delivers messages, e.g. a worker's global scope. */
export interface MessageSource {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent) => void,
  ): void;
  /** MessagePorts only deliver once started. */
  start?: () => void;
}

export const isVuuConnectMessage = (
  message: unknown,
): message is VuuConnectMessage =>
  (message as VuuConnectMessage | undefined)?.type === VUU_CONNECT &&
  (message as VuuConnectMessage).port !== undefined;

export const isVuuCloseMessage = (
  message: unknown,
): message is VuuCloseMessage =>
  (message as VuuCloseMessage | undefined)?.type === VUU_CLOSE;
