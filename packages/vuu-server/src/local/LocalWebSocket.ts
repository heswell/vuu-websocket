import {
  isVuuCloseMessage,
  type PostMessageTarget,
  VUU_CLOSE,
  VUU_CONNECT,
  type VuuCloseMessage,
  type VuuConnectMessage,
} from "./protocol";

/** Opens a new connection to a local Vuu server; returns the client's port. */
export type LocalPortOpener = (url: string) => MessagePort;

/**
 * Opens connections through a connector that a local server is accepting
 * on (see `acceptConnections`), e.g. the server's Worker, or a MessagePort
 * whose other end the server worker holds.
 */
export const openPortVia =
  (connector: PostMessageTarget): LocalPortOpener =>
  () => {
    const { port1, port2 } = new MessageChannel();
    const connect: VuuConnectMessage = { type: VUU_CONNECT, port: port2 };
    connector.postMessage(connect, [port2]);
    return port1;
  };

type Listener = (event: Event) => void;

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

/**
 * Creates a class that can stand in for the global WebSocket, so that a Vuu
 * client (ConnectionManager, server-proxy) talks to a local server over
 * MessagePorts, without code changes:
 *
 *   self.WebSocket = createLocalWebSocketClass(openPortVia(connectorPort));
 *
 * Each instance opens a new port, so reconnects get a fresh connection, as
 * they would with a real WebSocket. Only text messages are supported.
 */
export function createLocalWebSocketClass(openPort: LocalPortOpener) {
  return class LocalWebSocket extends EventTarget {
    static readonly CONNECTING = CONNECTING;
    static readonly OPEN = OPEN;
    static readonly CLOSING = CLOSING;
    static readonly CLOSED = CLOSED;
    readonly CONNECTING = CONNECTING;
    readonly OPEN = OPEN;
    readonly CLOSING = CLOSING;
    readonly CLOSED = CLOSED;

    readonly url: string;
    readonly protocol = "";
    readonly extensions = "";
    binaryType: BinaryType = "blob";
    bufferedAmount = 0;
    readyState: number = CONNECTING;

    onopen: Listener | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: Listener | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;

    #port: MessagePort;

    constructor(url: string | URL, _protocols?: string | string[]) {
      super();
      this.url = String(url);
      this.#port = openPort(this.url);
      this.#port.addEventListener("message", this.#receive);
      this.#port.start();
      // A real socket opens asynchronously; callers attach handlers first.
      setTimeout(() => {
        if (this.readyState === CONNECTING) {
          this.readyState = OPEN;
          this.#dispatch(new Event("open"), this.onopen);
        }
      }, 0);
    }

    send(data: string) {
      if (this.readyState === CONNECTING) {
        throw new DOMException(
          "Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.",
          "InvalidStateError",
        );
      }
      if (typeof data !== "string") {
        throw new TypeError("LocalWebSocket only sends text messages");
      }
      if (this.readyState === OPEN) {
        this.#port.postMessage(data);
      }
    }

    close(code = 1000, reason = "") {
      if (this.readyState === CLOSING || this.readyState === CLOSED) {
        return;
      }
      const message: VuuCloseMessage = { type: VUU_CLOSE, code, reason };
      this.#port.postMessage(message);
      this.readyState = CLOSING;
      // Let any pending opens resolve before the close, as a socket would.
      setTimeout(() => this.#closed(code, reason), 0);
    }

    #receive = ({ data }: MessageEvent) => {
      if (this.readyState === CLOSED) {
        return;
      }
      if (typeof data === "string") {
        this.#dispatch(new MessageEvent("message", { data }), this.onmessage);
      } else if (isVuuCloseMessage(data)) {
        this.#closed(data.code ?? 1005, data.reason ?? "");
      }
    };

    #closed(code: number, reason: string) {
      if (this.readyState !== CLOSED) {
        this.readyState = CLOSED;
        this.#port.removeEventListener("message", this.#receive);
        this.#port.close();
        this.#dispatch(
          new CloseEvent("close", { code, reason, wasClean: true }),
          this.onclose,
        );
      }
    }

    #dispatch<E extends Event>(
      event: E,
      handler: ((event: E) => void) | null,
    ) {
      handler?.call(this, event);
      this.dispatchEvent(event);
    }
  };
}
