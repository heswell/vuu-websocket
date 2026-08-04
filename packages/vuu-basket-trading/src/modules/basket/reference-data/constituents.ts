import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import ftse from "./ftse100";
import hsi from "./hsi";
import nasdaq from "./nasdaq100";
import sp500 from "./sp500";

const rows: VuuDataRow[] = [];

for (const [ric, name, lastTrade, change, volume] of ftse) {
  rows.push([
    ".FTSE100",
    change,
    name,
    lastTrade,
    ric,
    `${ric}-.FTSE100`,
    "BUY",
    volume,
    1,
  ]);
}

for (const [name, ric, lastTrade, change, , volume] of hsi) {
  rows.push([
    ".HSI",
    change,
    name,
    lastTrade,
    ric,
    `${ric}-.HSI`,
    "BUY",
    volume,
    1,
  ]);
}

for (const [name, ric, weighting, lastTrade, change] of nasdaq) {
  rows.push([
    ".NASDAQ100",
    change,
    name,
    lastTrade,
    ric,
    `${ric}-.NASDAQ100`,
    "BUY",
    "1000",
    weighting,
  ]);
}

for (const [name, ric, weighting, , change] of sp500) {
  rows.push([
    ".SP500",
    change,
    name,
    0,
    ric,
    `${ric}-.SP500`,
    "BUY",
    "1000",
    weighting,
  ]);
}

export default rows;
