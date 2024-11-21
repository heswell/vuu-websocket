import { Provider, random } from "@heswell/vuu-module";
import { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";

const suffixes = ["L", "N", "OQ", "AS", "PA", "MI", "FR", "AT"];
const locations: Record<string, [string, string]> = {
  L: ["London PLC", "XLON/LSE-SETS"],
  N: ["Corporation", "XNGS/NAS-GSM"],
  AS: ["B.V.", "XAMS/ENA-MAIN"],
  OQ: ["Co.", "XNYS/NYS-MAIN"],
  PA: ["Paris", "PAR/EUR_FR"],
  MI: ["Milan", "MIL/EUR_IT"],
  FR: ["Frankfurt", "FR/EUR_DE"],
  AT: ["Athens", "AT/EUR_GR"],
};
const currencies = ["CAD", "GBX", "USD", "EUR", "GBP"];

// const chars = Array.from("ABCDEFGHIJKLMNOPQRS");
const chars = Array.from("ABCDEFGHIJK");
// const chars = Array.from("AB");

export class InstrumentProvider extends Provider {
  async load() {
    console.log("[InstrumentProvider] load instruments");

    const { schema } = this.table;

    const columns = schema.columns.map((col) => col.name);
    const colCount = columns.length;
    const row: Record<string, VuuRowDataItemType> = {};
    const start = performance.now();
    chars.forEach((c0) => {
      chars.forEach((c1) => {
        chars.forEach((c2) => {
          chars.forEach((c3) => {
            suffixes.forEach((suffix) => {
              row.ric = `${c0}${c1}${c2}${c3}.${suffix}`;
              row.bbg = `${c0}${c1}${c2}${c3} ${suffix}`;
              row.isin = `${c0}${c1}${c2}${c3}`;
              row.description = `${row.ric} ${locations[suffix][0]}`;
              row.currency = currencies[random(0, 4)];
              row.exchange = locations[suffix][1];
              row.lotSize = random(10, 1000);
              const dataRow: VuuRowDataItemType[] = Array(colCount);
              // export data in same order that columns are specified in schema
              for (let i = 0; i < colCount; i++) {
                dataRow[i] = row[columns[i]];
              }
              this.table.insert(dataRow, false);
            });
          });
        });
      });
    });

    const end = performance.now();
    console.log(
      `InstrumentsProvider  created ${this.table.rowCount} rows, took ${
        end - start
      } ms`
    );

    this.loaded = true;
  }
}
