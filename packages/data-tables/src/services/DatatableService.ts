import {
  DataTableDefinition,
  DataTableService,
  ServerConfig,
} from "@heswell/server-types";
import { Table } from "./Table";
import { ServiceHandlers } from "@heswell/server-core/src/requestHandlers";
import { asTableKey, vuuTableFromKey } from "./data-service-utils";
import { VuuTable } from "@vuu-ui/vuu-protocol-types";

const _tables: { [key: string]: Table } = {};

const configure = async (props: ServerConfig) => {
  const { DataTables } = props;
  if (Array.isArray(DataTables)) {
    console.log(
      `Data Table service, configured with tables ${DataTables?.map(
        (c) => c.schema.table.table
      )}`
    );
    await Promise.all(
      DataTables.map(async (config) => await createTable(config))
    );
  } else {
    console.log(`Data Table service configured with no tables`);
  }
};

async function createTable({ dataPath, ...config }: DataTableDefinition) {
  const table = new Table(config);
  const key = asTableKey(config.schema.table);
  _tables[key] = table;

  if (dataPath) {
    await table.loadData(dataPath);
  }

  return table;
}

const getTable = (vuuTable: VuuTable) => {
  const table = _tables[asTableKey(vuuTable)];
  if (table) {
    return table;
  } else {
    throw Error(`No table ${vuuTable.module}/${vuuTable.table}`);
  }
};

const getTableList = () => {
  return Object.keys(_tables).map<VuuTable>(vuuTableFromKey);
};

export const messageAPI: ServiceHandlers = {};

export const serviceAPI: DataTableService = {
  configure,
  getTable,
  getTableList,
};
