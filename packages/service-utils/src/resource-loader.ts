import { Table } from "@heswell/data";
import { ResourceMessage } from "./StoreDataStreamSource";

export interface ResourceRequest {
  columns?: string[];
  resource: string;
  type: "snapshot" | "subscription";
}

export type RemoteResourceUpdateType = "insert" | "update" | "delete";

export type RemoteResourceMessageType = RemoteResourceUpdateType | "snapshot";

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
}: {
  columns?: string[];
  remoteResourceMessageType?: RemoteResourceMessageType[];
  resource: string;
  signal?: AbortSignal;
  table: Table;
  url: string;
}) => {
  const requestSnapshot = remoteResourceMessageType.includes("snapshot");
  const requestInserts = remoteResourceMessageType.includes("insert");
  const requestUpdates = remoteResourceMessageType.includes("update");
  const { promise, resolve, reject } = Promise.withResolvers<number>();
  let socketStatus: "init" | "open" | "closed" | "data-load-complete" = "init";
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let terminal = false;

  const close = () => {
    terminal = true;
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
    socket?.close();
    socket = null;
    signal?.removeEventListener("abort", close);
    if (signal?.aborted && socketStatus !== "data-load-complete") {
      reject(
        new Error(
          `[service-utils:loadTableFromRemoteResource] aborted ${resource} at ${url}`,
        ),
      );
    }
  };

  signal?.addEventListener("abort", close, { once: true });
  if (signal?.aborted) {
    close();
    return promise;
  }

  const connect = () => {
    if (signal?.aborted) {
      return;
    }
    console.log(
      `[service-utils:loadTableFromRemoteResource] connect to ${url} (${resource} service)`
    );

    socket = new WebSocket(url);

    socket.addEventListener("message", (evt) => {
      if (terminal || signal?.aborted) {
        return;
      }
      try {
        const message = JSON.parse(evt.data as string) as ResourceMessage;

        if (message.type === "snapshot-count") {
          console.log(
            `[service-utils:loadTableFromRemoteResource] final snapshot  ${message.count} ${resource} rows received`,
          );
          socketStatus = "data-load-complete";

          if (!requestUpdates && !requestInserts) {
            socket?.close();
          }
          resolve(message.count);
        } else if (message.type === "snapshot-batch") {
          for (const row of message.rows) {
            table.insert(row);
          }
        } else if (message.type === "insert") {
          table.insert(message.row);
        } else if (message.type === "inserts") {
          console.log(`inserts received`);
        } else {
          throw Error(
            `[service-utils] unexpected message from remote resource service`,
          );
        }
      } catch (error: unknown) {
        close();
        reject(error);
      }
    });

    socket.addEventListener("open", () => {
      socketStatus = "open";
      console.log(
        `[service-utils:loadTableFromRemoteResource] connected ${resource} at ${url}`
      );
      if (requestSnapshot && requestInserts) {
        socket?.send(
          JSON.stringify({ type: "subscription", columns, resource }),
        );
      } else if (requestSnapshot) {
        socket?.send(JSON.stringify({ type: "snapshot", columns, resource }));
      }
    });

    socket.addEventListener("error", () => {
      console.error(
        `[service-utils:loadTableFromRemoteResource] error ${resource} at ${url}`,
      );
    });
    socket.addEventListener("close", () => {
      // TODO what if we lose connection after we've received snapshot ? We would want to ask for all
      // updates since last received
      console.log(
        `[service-utils:loadTableFromRemoteResource] close ${resource} at ${url}`
      );
      socket = null;
      if (
        socketStatus !== "data-load-complete" &&
        !signal?.aborted &&
        !terminal
      ) {
        reconnectTimer = setTimeout(connect, 1000);
      }
    });
  };

  try {
    connect();
  } catch (error: unknown) {
    console.log(
      `[service-utils:loadTableFromRemoteResource] unable to connect to ${url}`,
    );
    reject(error);
  }

  return promise;
};
