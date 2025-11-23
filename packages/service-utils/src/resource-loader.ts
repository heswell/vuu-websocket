import { Table } from "@heswell/data";
import { ResourceMessage } from "./ArrayDataStreamSource";

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
}: {
  columns?: string[];
  remoteResourceMessageType?: RemoteResourceMessageType[];
  resource: string;
  table: Table;
  url: string;
}) => {
  const requestSnapshot = remoteResourceMessageType.includes("snapshot");
  const requestInserts = remoteResourceMessageType.includes("insert");
  const requestUpdates = remoteResourceMessageType.includes("update");
  let { promise, resolve, reject } = Promise.withResolvers<number>();
  let socketStatus: "init" | "open" | "closed" | "data-load-complete" = "init";
  try {
    console.log(
      `[service-utils:loadTableFromRemoteResource] connect to ${url} (${resource} service)`
    );
    // const socketTimeout = setTimeout(() => {
    //   if (socketStatus === "init") {
    //     console.log("no connection after 5 seconds, closing socket");
    //     socket.close();
    //   }
    // }, 5000);

    let socket: WebSocket | null = new WebSocket(url);

    socket.addEventListener("message", (evt) => {
      const message = JSON.parse(evt.data as string) as ResourceMessage;

      if (message.type === "snapshot-count") {
        console.log(
          `[service-utils:loadTableFromRemoteResource] final snapshot  ${message.count} ${resource} rows received`
        );
        socketStatus = "data-load-complete";

        if (!requestUpdates && !requestInserts) {
          socket?.close();
        }
        // Promise is resolved when initial data load completes, updates, inserts and deletes,
        // if requested, continue to be processed.
        // TODO - in which case we should also return a 'stop' command
        resolve(message.count);
      } else if (message.type === "snapshot-batch") {
        for (const row of message.rows) {
          table.insert(row);
        }
      } else if (message.type === "insert") {
        console.log(`>>> ${message.row[6]}`);
        table.insert(message.row);
      } else {
        console.log({ message });
        throw Error(
          `[service-utils] unexpected message from remote resource service`
        );
      }
    });

    socket.addEventListener("open", () => {
      socketStatus = "open";
      console.log(
        `[service-utils:loadTableFromRemoteResource] connected ${resource} at ${url}`
      );
      if (requestSnapshot && requestInserts) {
        socket?.send(
          JSON.stringify({ type: "subscription", columns, resource })
        );
      } else if (requestSnapshot) {
        socket?.send(JSON.stringify({ type: "snapshot", columns, resource }));
      }
    });

    socket.addEventListener("error", (evt) => {
      console.log(
        `[service-utils:loadTableFromRemoteResource] error ${resource} at ${url} `
      );
    });
    socket.addEventListener("close", () => {
      // TODO what if we lose connection after we've received snapshot ? We would want to ask for all
      // updates since last received
      console.log(
        `[service-utils:loadTableFromRemoteResource] close ${resource} at ${url}`
      );
      socket = null;
      if (socketStatus !== "data-load-complete") {
        setTimeout(() => {
          loadTableFromRemoteResource({ columns, resource, url, table });
        }, 1000);
      }
    });
  } catch (err) {
    console.log(
      `[service-utils:loadTableFromRemoteResource] unable to connect to ${url}`
    );
    reject(err);
  }

  return promise;
};
