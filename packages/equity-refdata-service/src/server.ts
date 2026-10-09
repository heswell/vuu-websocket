import path from "node:path";
import { DataService, TablePublisher } from "@heswell/service-utils";
import { Table } from "@heswell/vuu-table";
import { loadConfig } from "./config";
import { loadNdjson } from "./loader";
import { equitiesSchema } from "./schema";

export interface EquityRefDataServiceOptions {
  dataPath?: string;
  log?: (message: string) => void;
  port?: number;
}

const DEFAULT_DATA_PATH = path.resolve(
  import.meta.dir,
  "../data/equities.ndjson",
);

/**
 * Publishes the equities resource. The service accepts connections
 * immediately, subscribers receive their snapshot once loading completes.
 */
export function start(options: EquityRefDataServiceOptions = {}) {
  const config = loadConfig();
  const log = options.log ?? console.log;
  const port = options.port ?? config.getNumber("service.port");
  const dataPath =
    options.dataPath ??
    (config.has("equities.dataPath")
      ? config.getPath("equities.dataPath")
      : DEFAULT_DATA_PATH);

  const equities = new Table({ schema: equitiesSchema });
  const publisher = new TablePublisher({ table: equities, ready: false });
  const service = new DataService({ name: "EQUITIES:service", port, log })
    .addPublisher(publisher)
    .start();

  const loaded = loadNdjson(equities, dataPath, (message) =>
    log(`[EQUITIES:service] ${message}`),
  ).then((count) => {
    publisher.setReady();
    return count;
  });

  return { equities, loaded, service };
}
