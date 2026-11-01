import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { parse } from "csv-parse/sync";

const { values } = parseArgs({
  options: {
    "source-dir": { type: "string" },
    check: { type: "boolean" },
  },
});
const sourceDirectory = values["source-dir"];
if (!sourceDirectory) {
  throw new Error(
    "Provide --source-dir pointing to finos/vuu/example/main/src/main/resources/static",
  );
}
const output = new URL(
  "../src/modules/basket/reference-data/constituents.json",
  import.meta.url,
);
const baskets = [
  ["ftse100", ".FTSE100", "Last Trade", "Change"],
  ["hsi", ".HSI", "Last", "Change"],
  ["nasdaq100", ".NASDAQ100", "Last Trade", "Chg"],
  ["sp500", ".SP500", "Price", "Change"],
] as const;

const constituents = baskets.flatMap(([file, basketId, priceColumn, changeColumn]) => {
  const records: Record<string, string>[] = parse(
    readFileSync(resolve(sourceDirectory, `${file}.csv`), "utf8"),
    {
      columns: (headers: string[]) => headers.map((header) => header.trim()),
      skip_empty_lines: true,
      trim: true,
    },
  );
  const keys = new Set<string>();
  return records.map((record, index) => {
    for (const column of ["Symbol", "Name", "Weighting", priceColumn, changeColumn]) {
      if (!(column in record)) throw new Error(`${file}.csv: missing column ${column}`);
    }
    const ric = record.Symbol;
    const weighting = Number(record.Weighting);
    const price = record[priceColumn].replaceAll(",", "");
    if (
      !ric || !record.Name || !record.Weighting || !Number.isFinite(weighting) ||
      !Number.isFinite(parseFloat(price)) || keys.has(ric)
    ) {
      throw new Error(`${file}.csv: invalid or duplicate constituent at row ${index + 2}`);
    }
    keys.add(ric);
    return {
      basketId,
      change: record[changeColumn],
      description: record.Name,
      lastTrade: price,
      ric,
      ricBasketId: `${ric}-${basketId}`,
      side: "BUY",
      volume: record.Volume ?? "",
      weighting,
    };
  });
});
const json = `${JSON.stringify(constituents, null, 2)}\n`;
if (values.check) {
  if (readFileSync(output, "utf8") !== json) {
    throw new Error("Basket JSON is stale. Run generate:basket-data with the canonical CSV directory");
  }
  console.log("Basket JSON matches canonical server CSVs");
} else {
  writeFileSync(output, json);
  console.log(`Generated ${constituents.length} basket constituents from canonical server CSVs`);
}
