import {
  DataTableDefinition,
  RestHandler,
  ServerConfig,
} from "@heswell/server-types";
import { Table } from "@heswell/viewserver";
import { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import { ColumnMap } from "@vuu-ui/vuu-utils";
import { getRestRange } from "./rest-utils";

const _tables: { [key: string]: Table } = {};

async function createTable({ dataPath, ...config }: DataTableDefinition) {
  const table = new Table(config);
  _tables[table.name] = table;
  if (dataPath) {
    await table.loadData(dataPath);
  }
  return table;
}

type Entity = { [key: string]: VuuRowDataItemType };
const dataSourceRowToEntity = (row: VuuDataRow, columnMap: ColumnMap) =>
  Object.entries(columnMap).reduce((entity, [name, index]) => {
    entity[name] = row[index];
    return entity;
  }, {} as Entity);

export const configure = (props: ServerConfig): Promise<Table[]> => {
  // const { DataTables } = props;
  // return Promise.all(
  //   DataTables.map(async (config) => await createTable(config))
  // );
};

export const restHandler: RestHandler = (request) => {
  const url = new URL(request.url);
  switch (url.pathname) {
    case "/api/instruments/summary": {
      const { rows } = _tables["SIMUL:instruments"];
      return new Response(JSON.stringify({ recordCount: rows.length }), {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Content-Type": "application/json",
        },
      });
    }
    case "/api/instruments": {
      const { origin, limit } = getRestRange(url);
      console.log(`origin = ${origin} limit = ${limit}`);
      const { columnMap, rows } = _tables["SIMUL:instruments"];
      const start = performance.now();
      const data = rows
        .slice(origin, origin + limit)
        .map((r) => JSON.stringify(dataSourceRowToEntity(r, columnMap)))
        .join("\n");
      const end = performance.now();
      console.log(`serializing data took ${end - start}ms`);

      return new Response(data, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          // "Content-Type": "application/x-ndjson"
          "Content-Type": "text/plain",
        },
      });
    }

    default:
      return new Response(`invalid /api path '${url.pathname}'`);
  }
};
