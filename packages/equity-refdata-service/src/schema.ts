import type { SchemaColumn, TableSchema } from "@vuu-ui/vuu-data-types";

/** One row of the equities resource, as stored in data/equities.ndjson. */
export interface EquityDto {
  assetClass: string;
  avgDailyTrades: number | null;
  avgDailyTurnover: number | null;
  bbg: string;
  currency: string;
  description: string;
  exchange: string;
  isin: string;
  issuerCountry: string | null;
  issuerName: string | null;
  liquid: boolean;
  lotSize: number;
  parentName: string | null;
  ric: string;
  tickSizeBand: number;
  venueName: string;
}

export const equityColumns: SchemaColumn[] = [
  { name: "assetClass", serverDataType: "string" },
  { name: "avgDailyTrades", serverDataType: "int" },
  { name: "avgDailyTurnover", serverDataType: "double" },
  { name: "bbg", serverDataType: "string" },
  { name: "currency", serverDataType: "string" },
  { name: "description", serverDataType: "string" },
  { name: "exchange", serverDataType: "string" },
  { name: "isin", serverDataType: "string" },
  { name: "issuerCountry", serverDataType: "string" },
  { name: "issuerName", serverDataType: "string" },
  { name: "liquid", serverDataType: "boolean" },
  { name: "lotSize", serverDataType: "int" },
  { name: "parentName", serverDataType: "string" },
  { name: "ric", serverDataType: "string" },
  { name: "tickSizeBand", serverDataType: "int" },
  { name: "venueName", serverDataType: "string" },
  { name: "vuuCreatedTimestamp", serverDataType: "long" },
  { name: "vuuUpdatedTimestamp", serverDataType: "long" },
];

export const equitiesSchema: TableSchema = {
  columns: equityColumns,
  key: "ric",
  table: { module: "REFDATA", table: "equities" },
};
