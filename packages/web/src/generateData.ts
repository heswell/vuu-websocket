import { SchemaColumn, TableSchema } from "@vuu-ui/vuu-data-types";

export const generateData = (schema: TableSchema, count = 100) => {
  const { columns } = schema;

  const data = [];

  for (let i = 0; i < count; i++) {
    data.push(generateRow(columns, i));
  }

  return data;
};

export const currencies = ["CAD", "GBX", "USD", "EUR", "GBP"];
export const locations: { [key: string]: string[] } = {
  L: ["London PLC", "XLON/LSE-SETS"],
  N: ["Corporation", "XNGS/NAS-GSM"],
  AS: ["B.V.", "XAMS/ENA-MAIN"],
  OQ: ["Co.", "XNYS/NYS-MAIN"],
  PA: ["Paris", "PAR/EUR_FR"],
  MI: ["Milan", "MIL/EUR_IT"],
  FR: ["Frankfurt", "FR/EUR_DE"],
  AT: ["Athens", "AT/EUR_GR"],
};
export const suffixes = ["L", "N", "OQ", "AS", "PA", "MI", "FR", "AT"];
export const exchanges = Object.values(locations).map(([, x]) => x);

export function random(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const generateCurrency = () => currencies[random(0, currencies.length - 1)];
const generateExchange = () => exchanges[random(0, exchanges.length - 1)];

function generateRow(columns: SchemaColumn[], index: number) {
  return columns.map(({ name }) => {
    switch (name) {
      case "id":
        return "ID" + `${index}`.padStart(5, "0");
      case "ric":
        return "VOD.L";
      case "currency":
        return generateCurrency();
      case "exchange":
        return generateExchange();
      case "lotSize":
        return 100;
      case "price":
        return 100.5;
      case "quantity":
        return 1000;
      default:
        throw Error("unknown column");
    }
  });
}
