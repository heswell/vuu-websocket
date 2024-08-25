import { DataView, Table } from "@heswell/data";
import { TableSchema } from "@vuu-ui/vuu-data-types";

const schema: TableSchema = {
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "ric", serverDataType: "string" },
    { name: "currency", serverDataType: "string" },
    { name: "lotSize", serverDataType: "string" },
  ],
  key: "id",
  table: {
    module: "TEST",
    table: "instruments",
  },
};

const data = [
  ["ID000000", "ABC.L", "USD", 1000],
  ["ID000001", "BCD.L", "GBP", 500],
  ["ID000002", "CDE.L", "USD", 200],
  ["ID000003", "DEF.L", "EUR", 500],
  ["ID000004", "EFG.L", "USD", 200],
  ["ID000005", "FGH.L", "GBP", 500],
  ["ID000006", "GHI.L", "GBP", 500],
  ["ID000007", "HIJ.L", "CHF", 200],
  ["ID000008", "IJK.L", "GBP", 500],
  ["ID000009", "JKL.L", "GBP", 500],
  ["ID000010", "KLM.L", "HKD", 150],
  ["ID000011", "LMN.L", "GBP", 500],
  ["ID000012", "MNO.L", "GBP", 100],
  ["ID000013", "NOP.L", "USD", 500],
  ["ID000014", "OPQ.L", "USD", 500],
  ["ID000015", "PQR.L", "GBP", 200],
  ["ID000016", "QRS.L", "GBP", 500],
  ["ID000017", "RST.L", "GBP", 1000],
  ["ID000018", "STU.L", "GBP", 500],
  ["ID000019", "STU.L", "GBP", 500],
];

const table = new Table({ data, schema });

const view = new DataView(table, {
  columns: ["id", "ric", "currency", "lotSize"],
  filterSpec: { filter: "" },
  groupBy: [],
  sort: { sortDefs: [] },
});

console.log(
  "%c--------- get initial data {from:0, to: 10 }    ---------",
  "color:green;font-weight:bold;font-size: large;"
);
let { rows, size } = view.setRange({ from: 0, to: 10 });
console.log(`${rows.length} rows of ${size}`);
console.table(rows);

console.log(
  "%c--------- group by currency     ---------",
  "color:green;font-weight:bold;font-size: large;"
);
({ rows, size } = view.group(["currency", "ric"]));
console.log(`${rows.length} rows of ${size}`);
console.table(rows);

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
