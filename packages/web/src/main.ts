import { DataView, Table } from "@heswell/data";
import { TableSchema } from "@vuu-ui/vuu-data-types";
import { DataResponse } from "@heswell/data/src/store/rowset";
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

console.log(
  "%c--------- get initial data {from:0, to: 50 }    ---------",
  "color:green;font-weight:bold;font-size: large;"
);
let { rows, size } = view.setRange({ from: 0, to: 30 });
console.log(`${rows.length} rows of ${size}`);
// console.table(rows);

// let aggregations: VuuAggregation[] = [{ column: "MarketCap", aggType: 1 }];
// console.log(
//   `%c--------- aggregate  [${JSON.stringify(aggregations)}]     ---------`,
//   "color:green;font-weight:bold;font-size: large;"
// );
// ({ rows, size } = view.aggregate(aggregations));
// console.table(rows);
// console.table(rows.map((r) => r.data));

// console.log(
//   `%c--------- filter by Market Cap    ---------`,
//   "color:green;font-weight:bold;font-size: large;"
// );
// ({ rows, size } = view.filter({ filter: "MarketCap < 50000000" }));
// console.log({ size });
// console.table(rows);
// console.table(rows.map((r) => r.data));

let groupBy = ["Sector"];
console.log(
  `%c--------- group by [${groupBy.join(",")}]     ---------`,
  "color:green;font-weight:bold;font-size: large;"
);
let response = view.group(groupBy) as DataResponse;
if (response) {
  ({ rows, size } = response);
  console.log(`${rows.length} rows of ${size}`);
  console.table(rows);
  console.table(rows.map((r) => r.data));
}

// groupBy = ["Sector", "Industry"];
// console.log(
//   `%c--------- group by [${groupBy.join(",")}]     ---------`,
//   "color:green;font-weight:bold;font-size: large;"
// );
// response = view.group(groupBy) as DataResponse;
// if (response) {
//   ({ rows, size } = response);
//   console.log(`${rows.length} rows of ${size}`);
//   console.table(rows);
//   console.table(rows.map((r) => r.data));
// }

console.log("expand node Capital Goods");
({ rows, size } = view.openTreeNode("$root|Capital Goods"));
console.log({ size });
console.table(rows);
console.table(rows.map((r) => r.data));

console.log("select row Capital Goods");
({ rows, size } = view.select([1, 2]));
console.log({ size });
console.table(rows);
console.table(rows.map((r) => r.data));

// console.log("expand node Basic Industries");
// ({ rows, size } = view.openTreeNode("$root|Basic Industries"));
// console.log({ size });
// console.table(rows);
// console.table(rows.map((r) => r.data));

// console.log("expand node Basic Industries, Aluminum");
// ({ rows, size } = view.openTreeNode("$root|Basic Industries|Aluminum"));
// console.log({ size });
// console.table(rows);
// console.table(rows.map((r) => r.data));

// console.log("expand node  Major Chemicals");
// ({ rows, size } = view.openTreeNode("$root|Basic Industries|Major Chemicals"));
// console.log({ size });
// console.table(rows);
// console.table(rows.map((r) => r.data));

// ({ rows, size } = view.setRange({ from: 10, to: 20 }));
// console.table(rows);

// console.log("collapse node Basic Industries");
// ({ rows, size } = view.closeTreeNode("$root|Basic Industries"));
// console.log({ size });
// console.table(rows);
// console.table(rows.map((r) => r.data));

if (false) {
  console.log(
    "%c--------- select row [4]    ---------",
    "color:green;font-weight:bold;font-size: large;"
  );
  ({ rows, size } = view.select([4]));
  console.log(`${rows.length} rows of ${size}`);
  console.table(rows);

  console.log(
    "%c--------- sort by lotSize    ---------",
    "color:green;font-weight:bold;font-size: large;"
  );
  ({ rows, size } = view.sort({
    sortDefs: [{ column: "lotSize", sortType: "A" }],
  }));
  console.log(`${rows.length} rows of ${size}`);
  console.table(rows);

  console.log(
    "%c--------- filter currency = USD    ---------",
    "color:green;font-weight:bold;font-size: large;"
  );
  ({ rows, size } = view.filter({ filter: 'currency = "USD"' }));
  console.log(`${rows.length} rows of ${size}`);
  console.table(rows);

  console.log(
    "%c--------- reverse sort ---------",
    "color:green;font-weight:bold;font-size: large;"
  );
  ({ rows, size } = view.sort({
    sortDefs: [{ column: "lotSize", sortType: "D" }],
  }));
  console.log(`${rows.length} rows of ${size}`);
  console.table(rows);

  console.log(
    "%c--------- select row [0] ---------",
    "color:green;font-weight:bold;font-size: large;"
  );
  ({ rows, size } = view.select([0]));
  console.log(`${rows.length} rows of ${size}`);
  console.table(rows);

  console.log(
    "%c--------- reverse sort again -------",
    "color:green;font-weight:bold;font-size: large;"
  );
  ({ rows, size } = view.sort({
    sortDefs: [{ column: "lotSize", sortType: "A" }],
  }));
  console.log(`${rows.length} rows of ${size}`);
  console.table(rows);

  ({ rows, size } = view.sort({
    sortDefs: [{ column: "lotSize", sortType: "A" }],
  }));
  console.log(`${rows.length} rows of ${size}`);
  console.table(rows);

  ({ rows, size } = view.select([0]));
  console.log(`${rows.length} rows of ${size}`);
  console.table(rows);

  ({ rows, size } = view.select([3]));
  console.log(`${rows.length} rows of ${size}`);
  console.table(rows);
}
