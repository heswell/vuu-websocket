import { getLogger } from "@heswell/service-utils/browser";
import type { ViewServerHandler } from "../net/ViewServerHandler";
import type { Channel } from "../net/ws/Channel";
import {
  isVuuCloseMessage,
  isVuuConnectMessage,
  type MessageSource,
  VUU_CLOSE,
  type VuuCloseMessage,
} from "./protocol";

const log = getLogger("vuu.net");

/** Stops serving: closes open connections, stops accepting new ones. */
export type StopServing = () => void;

/**
 * Serve one client connection on a MessagePort. The port behaves like a
 * server-side WebSocket: strings in are client messages, strings out are
 * server messages.
 */
export function serveMessagePort(
  handler: ViewServerHandler,
  port: MessagePort,
  onClosed?: () => void,
): StopServing {
  let closed = false;

  const finish = () => {
    if (!closed) {
      closed = true;
      port.removeEventListener("message", onMessage);
      port.close();
      handler.close(channel);
      onClosed?.();
    }
  };

  const channel: Channel = {
    data: { sessionId: crypto.randomUUID() },
    send(message: string) {
      if (!closed) {
        port.postMessage(message);
      }
    },
    // The server closes the connection, e.g. after a failed login.
    close(code?: number, reason?: string) {
      if (!closed) {
        port.postMessage({ type: VUU_CLOSE, code, reason } as VuuCloseMessage);
        finish();
      }
    },
  };

  function onMessage({ data }: MessageEvent) {
    if (typeof data === "string") {
      // handle() never rejects
      void handler.handle(data, channel);
    } else if (isVuuCloseMessage(data)) {
      log.debug(
        `local connection ${channel.data.sessionId} closed by client (${data.code} ${data.reason})`,
      );
      finish();
    } else {
      log.warn(
        `ignoring non-string message on local connection ${channel.data.sessionId}`,
      );
    }
  }

  port.addEventListener("message", onMessage);
  port.start();
  log.debug(`new local connection ${channel.data.sessionId}`);

  return () => {
    if (!closed) {
      port.postMessage({ type: VUU_CLOSE, code: 1001, reason: "server stopped" });
      finish();
    }
  };
}

/**
 * Accept connections from a connector: each `vuu-connect` message hands
 * over a MessagePort that is then served as one client connection. The
 * connector is typically a worker's global scope (`self`), or a MessagePort
 * shared with whatever creates client connections.
 */
export function acceptConnections(
  handler: ViewServerHandler,
  connector: MessageSource,
): StopServing {
  const connections = new Set<StopServing>();

  const onMessage = ({ data }: MessageEvent) => {
    if (isVuuConnectMessage(data)) {
      const stop: StopServing = serveMessagePort(handler, data.port, () =>
        connections.delete(stop),
      );
      connections.add(stop);
    }
  };

  connector.addEventListener("message", onMessage);
  connector.start?.();

  return () => {
    connector.removeEventListener("message", onMessage);
    [...connections].forEach((stop) => stop());
  };
}
