import { ConfiguredService, DataTableService } from "@heswell/server-types";
import { VuuTable } from "@vuu-ui/vuu-protocol-types";

export const isDataTableService = (
  service: ConfiguredService
): service is DataTableService =>
  typeof service === "object" &&
  "getTable" in service &&
  "getTableList" in service;

export const asTableKey = ({ module, table }: VuuTable) => `${module}:${table}`;

export const vuuTableFromKey = (key: string): VuuTable => {
  const parts = key.split(":");
  if (parts.length === 2) {
    return {
      module: parts[0],
      table: parts[1],
    };
  } else {
    throw Error(`key ${key} is not a valid table identifier`);
  }
};
