import {
  ConfiguredService,
  DataTableAPI,
  RestHandler,
  ServerConfig,
} from "@heswell/server-types";
import { filterPredicate, parseFilter } from "@vuu-ui/vuu-filter-parser";
import { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import { ColumnMap } from "@vuu-ui/vuu-utils";
import { getQueryFields, getRestRange, getSortSet } from "./rest-utils";

import { ServiceHandlers } from "@heswell/server-core/src/requestHandlers";
import { SortSet } from "@heswell/data";

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
      const table = dataTableAPI?.getTable(instruments);
      if (table) {
        return new Response(
          JSON.stringify({ recordCount: table.rows.length }),
          {
            headers: {
              ...CORS_HEADERS,
              "Content-Type": "application/json",
            },
          }
        );
      }
    }
    case "/api/instruments": {
      const params = url.searchParams;
      const { origin, limit } = getRestRange(url);
      console.log(`origin = ${origin} limit = ${limit}`);
      const queryParams = getQueryFields(url);
      const table = dataTableAPI?.getTable(instruments);
      if (table) {
        let { columnMap, rows } = table;
        const start = performance.now();
        let sortSet: SortSet | undefined = undefined;

        if (queryParams.filter) {
          const { filter: filterQuery } = queryParams.filter;
          const start = performance.now();
          const filter = parseFilter(filterQuery);
          const fn = filterPredicate(columnMap, filter);
          rows = rows.filter(fn);
          const end = performance.now();
          console.log(`filter took ${end - start}ms`);
        }

        if (queryParams.sort) {
          const start = performance.now();
          const {
            sort: { sortDefs },
          } = queryParams;
          sortSet = getSortSet(rows, sortDefs, columnMap);
          const end = performance.now();
          console.log(`sort took ${end - start}ms`);
        }

        const data = sortSet
          ? sortSet
              .slice(origin, origin + limit)
              .map(([rowIndex]) => rows[rowIndex])
          : rows.slice(origin, origin + limit);

        const dataOut = data
          .map((r) => JSON.stringify(dataSourceRowToEntity(r, columnMap)))
          .join("\n");
        const end = performance.now();
        console.log(`serializing data took ${end - start}ms`);

        return new Response(dataOut, {
          headers: {
            ...CORS_HEADERS,
            // "Content-Type": "application/x-ndjson"
            "Content-Type": "text/plain",
          },
        });
      }
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
