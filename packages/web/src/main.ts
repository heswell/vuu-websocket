import { DataView, Table } from "@heswell/data";
import { TableSchema } from "@vuu-ui/vuu-data-types";
import { getData } from "./data";

const schema: TableSchema = {
  columns: [
    { name: "Symbol", serverDataType: "string" },
    { name: "Name", serverDataType: "string" },
    { name: "Price", serverDataType: "double" },
    { name: "MarketCap", serverDataType: "long" },
    { name: "IPO", serverDataType: "string" },
    { name: "Sector", serverDataType: "string" },
    { name: "Industry", serverDataType: "int" },
  ],
  key: "Symbol",
  table: {
    module: "TEST",
    table: "instruments",
  },
};

const table = new Table({ schema });
getData(schema).forEach((row) => table.insert(row, false));

const id = "123";

const view = new DataView(id, table, {
  columns: schema.columns.map((c) => c.name),
  filterSpec: { filter: "" },
  groupBy: [],
  range: { from: 0, to: 10 },
  sort: { sortDefs: [] },
});

view.sort({
  sortDefs: [{ column: "IPO", sortType: "A" }],
});
const { rows, size } = view.filter({ filter: 'Sector = "Basic Industries"' });

console.log(`${rows.length} rows of ${size}`);
console.table(rows.map(({ data }) => data));
