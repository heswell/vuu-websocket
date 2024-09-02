import {
  ConfiguredService,
  DataTableAPI,
  RestHandler,
  ServerConfig,
} from "@heswell/server-types";
import { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import { ColumnMap } from "@vuu-ui/vuu-utils";
import { getRestRange } from "./rest-utils";
import { ServiceHandlers } from "@heswell/server-core/src/requestHandlers";

type Entity = { [key: string]: VuuRowDataItemType };
const dataSourceRowToEntity = (row: VuuDataRow, columnMap: ColumnMap) =>
  Object.entries(columnMap).reduce((entity, [name, index]) => {
    entity[name] = row[index];
    return entity;
  }, {} as Entity);

let dataTableAPI: DataTableAPI | undefined = undefined;

const configure = async ({ TableService }: ServerConfig) => {
  dataTableAPI = TableService;
};

const instruments = {
  module: "SIMUL",
  table: "instruments",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const restHandler: RestHandler = (request) => {
  const url = new URL(request.url);
  switch (url.pathname) {
    case "/api/instruments/summary": {
      const { rows } = dataTableAPI?.getTable(instruments);
      return new Response(JSON.stringify({ recordCount: rows.length }), {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json",
        },
      });
    }
    case "/api/instruments": {
      const { origin, limit } = getRestRange(url);
      console.log(`origin = ${origin} limit = ${limit}`);
      const { columnMap, rows } = dataTableAPI?.getTable(instruments);
      const start = performance.now();
      const data = rows
        .slice(origin, origin + limit)
        .map((r) => JSON.stringify(dataSourceRowToEntity(r, columnMap)))
        .join("\n");
      const end = performance.now();
      console.log(`serializing data took ${end - start}ms`);

      return new Response(data, {
        headers: {
          ...CORS_HEADERS,
          // "Content-Type": "application/x-ndjson"
          "Content-Type": "text/plain",
        },
      });
    }

    default:
      return new Response(`invalid /api path '${url.pathname}'`);
  }
};

export const messageAPI: ServiceHandlers = {
  restHandler,
};

export const serviceAPI: ConfiguredService = {
  configure,
};
