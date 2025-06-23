import { Table } from "@heswell/data";
import { ResourceMessage } from "./ArrayDataStreamSource";

export interface ResourceRequest {
  columns?: string[];
  resource: string;
  type: "snapshot";
}

export const loadTableFromRemoteResource = async ({
  columns,
  resource,
  url,
  table,
}: {
  columns?: string[];
  resource: string;
  table: Table;
  url: string;
}) => {
  let { promise, resolve, reject } = Promise.withResolvers<number>();

  try {
    const socket = new WebSocket(url);

    socket.addEventListener("message", (evt) => {
      const message = JSON.parse(evt.data as string) as ResourceMessage;

      if (message.type === "snapshot-count") {
        socket.close();
        resolve(message.count);
      } else if (message.type === "snapshot-batch") {
        for (const row of message.rows) {
          table.insert(row);
        }
      } else {
        throw Error(
          `[service-utils] unexpected message from remote resource service`
        );
      }
    });

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "snapshot", columns, resource }));
    });
  } catch (err) {
    reject(err);
  }

  return promise;
};
