import { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import logger from "../logger";

function random(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// const suffixes = ["L"];
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

// until we fix exports definition of vuu server
const schema = {
  columns: [
    { name: "bbg", dataType: "string" },
    { name: "currency", dataType: "string" },
    { name: "description", dataType: "string" },
    { name: "exchange", dataType: "string" },
    { name: "isin", dataType: "string" },
    { name: "lotSize", dataType: "int" },
    { name: "ric", dataType: "string" },
  ],
  joinFields: "ric",
  keyField: "ric",
  name: "instruments",
};

// const chars = Array.from("ABCDEFGHIJKLMNOPQRS");
const chars = Array.from("ABCDEFGHIJKLM");
// const chars = Array.from("ABCD");
// const chars = Array.from("ABC");

function createInstruments() {
  logger.info("[InstrumentWorker] load instruments");
  const columns = schema.columns.map((col) => col.name);
  const colCount = columns.length;
  const row: Record<string, VuuRowDataItemType> = {};

  let count = 0;

  console.time("generate instruments");
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
            const dataRow: VuuDataRow = Array(colCount);
            // export data in same order that columns are specified in schema
            for (let i = 0; i < colCount; i++) {
              dataRow[i] = row[columns[i]];
            }
            // logger.info({ "create instrument": dataRow });
            postMessage({ instrument: dataRow });
            count += 1;
          });
        });
      });
    });
  });
  postMessage({ count });
  console.timeEnd("generate instruments");
  logger.info(`${count} instruments created`);
}

self.onmessage = (evt: MessageEvent) => {
  const { type } = JSON.parse(evt.data);
  if (type === "create-instruments") {
    createInstruments();
  }
};
