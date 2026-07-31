import { Table } from "@heswell/data";
import { ResourceMessage } from "./StoreDataStreamSource";

export interface ResourceRequest {
  columns?: string[];
  resource: string;
  type: "snapshot" | "subscription";
}

export type RemoteResourceUpdateType = "insert" | "update" | "delete";

export type RemoteResourceMessageType = RemoteResourceUpdateType | "snapshot";

type RemoveSocketListener = () => void;

export interface RemoteResourceSocket {
  onClose(listener: (event: Event) => void): RemoveSocketListener;
  onError(listener: (event: Event) => void): RemoveSocketListener;
  onMessage(listener: (event: MessageEvent) => void): RemoveSocketListener;
  onOpen(listener: (event: Event) => void): RemoveSocketListener;
  close(): void;
  send(data: string): void;
}

export type RemoteResourceSocketFactory = (
  url: string,
) => RemoteResourceSocket;

const defaultSocketFactory: RemoteResourceSocketFactory = (url) => {
  const socket = new WebSocket(url);
  const listen = <K extends keyof WebSocketEventMap>(
    type: K,
    listener: (event: WebSocketEventMap[K]) => void,
  ) => {
    socket.addEventListener(type, listener);
    return () => socket.removeEventListener(type, listener);
  };
  return {
    close: () => socket.close(),
    onClose: (listener) => listen("close", listener),
    onError: (listener) => listen("error", listener),
    onMessage: (listener) => listen("message", listener),
    onOpen: (listener) => listen("open", listener),
    send: (data) => socket.send(data),
  };
};

// TODO make this a class with a loadSNapshot method, to give client finer grained control
export class RemoteResourceLoader {
  constructor(private table: Table, private url: string) {
    console.log(
      `[service-utils:RemoteResourceLoader] created for ${this.table.name} at ${this.url}`
    );
  }
  async loadSnapshot() {}
  subscribe(resourceUpdaterType: RemoteResourceUpdateType) {}
  unsubscribe() {}
  stop() {}
}

export const loadTableFromRemoteResource = async ({
  columns,
  remoteResourceMessageType = ["snapshot"],
  resource,
  url,
  table,
  signal,
  socketFactory = defaultSocketFactory,
}: {
  columns?: string[];
  remoteResourceMessageType?: RemoteResourceMessageType[];
  resource: string;
  signal?: AbortSignal;
  socketFactory?: RemoteResourceSocketFactory;
  table: Table;
  url: string;
}) => {
  const requestSnapshot = remoteResourceMessageType.includes("snapshot");
  const requestInserts = remoteResourceMessageType.includes("insert");
  const requestUpdates = remoteResourceMessageType.includes("update");
  const { promise, resolve, reject } = Promise.withResolvers<number>();
  let ready = false;
  let socket: RemoteResourceSocket | undefined;
  let terminal = false;
  const removeListeners: RemoveSocketListener[] = [];

  const terminate = (closeSocket: boolean) => {
    if (terminal) {
      return;
    }
    terminal = true;
    for (const removeListener of removeListeners.splice(0)) {
      removeListener();
    }
    signal?.removeEventListener("abort", abort);
    if (closeSocket) {
      socket?.close();
    }
    socket = undefined;
  };

  const fail = (error: unknown, closeSocket = true) => {
    if (!terminal) {
      terminate(closeSocket);
      if (!ready) {
        reject(error);
      }
    }
  };

  const abort = () => {
    fail(
      new Error(
        `[service-utils:loadTableFromRemoteResource] aborted ${resource} at ${url}`,
      ),
    );
  };

  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) {
    abort();
    return promise;
  }

  try {
    console.log(
      `[service-utils:loadTableFromRemoteResource] connect to ${url} (${resource} service)`,
    );
    socket = socketFactory(url);

    removeListeners.push(
      socket.onMessage((evt) => {
        if (terminal || signal?.aborted) {
        return;
        }
        try {
        const message = JSON.parse(evt.data as string) as ResourceMessage;

        if (message.type === "snapshot-count") {
          console.log(
            `[service-utils:loadTableFromRemoteResource] final snapshot ${message.count} ${resource} rows received`,
          );
          ready = true;
          resolve(message.count);
          if (!requestUpdates && !requestInserts) {
            terminate(true);
          }
        } else if (message.type === "snapshot-batch") {
          for (const row of message.rows) {
            table.insert(row);
          }
        } else if (message.type === "insert") {
          table.insert(message.row);
        } else if (message.type === "inserts") {
          console.log(`inserts received`);
        } else {
          fail(
            new Error(
              `[service-utils] unexpected message from remote resource service`,
            ),
          );
        }
        } catch (error: unknown) {
        fail(error);
        }
      }),
      socket.onOpen(() => {
        if (terminal) {
        return;
        }
        console.log(
        `[service-utils:loadTableFromRemoteResource] connected ${resource} at ${url}`,
        );
        if (requestSnapshot && requestInserts) {
        socket?.send(
          JSON.stringify({ type: "subscription", columns, resource }),
        );
        } else if (requestSnapshot) {
        socket?.send(
          JSON.stringify({ type: "snapshot", columns, resource }),
        );
        }
      }),
      socket.onError(() => {
        console.error(
        `[service-utils:loadTableFromRemoteResource] error ${resource} at ${url}`,
        );
        fail(
        new Error(
          `[service-utils:loadTableFromRemoteResource] connection error ${resource} at ${url}`,
        ),
        );
      }),
      socket.onClose(() => {
        console.log(
        `[service-utils:loadTableFromRemoteResource] close ${resource} at ${url}`,
        );
        if (ready) {
        terminate(false);
        } else {
        fail(
          new Error(
            `[service-utils:loadTableFromRemoteResource] connection closed before initial snapshot ${resource} at ${url}`,
          ),
          false,
        );
        }
      }),
    );
  } catch (error: unknown) {
    fail(error);
  }

  return promise;
};
