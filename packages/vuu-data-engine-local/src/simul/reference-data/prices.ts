import { buildDataColumnMap, type Table } from "../../Table";
import { BaseUpdateGenerator } from "../../UpdateGenerator";
import { schemas } from "../simul-schemas";
import { getInstrumentsData, InstrumentColumnMap } from "./instruments";
import { cloneRows, lazy, random } from "../../data-utils";
import basketConstituentData from "../../basket/reference-data/constituents";
import { createTable } from "../../core/table/TableContainer";

type ask = number;
type askSize = number;
type bid = number;
type bidSize = number;
type close = number;
type last = number;
type open = number;
type phase = "C";
type ric = string;
type scenario = "close";
type lastUpdate = number;
type created = number;
type vuuMsg = string;

export type PricesDataRow = [
  ask,
  askSize,
  bid,
  bidSize,
  close,
  last,
  open,
  phase,
  ric,
  scenario,
  lastUpdate,
  created,
  vuuMsg,
];

// Generated once, on first use. Tables copy these rows.
export const getPricesData = lazy(() => {
  const now = Date.now();
  const lastUpdate = now;
  const created = now;

  const pricesData: Array<PricesDataRow> = getInstrumentsData().map(
    (instrument) => {
      const spread = random(0, 10);
      const ric = instrument[InstrumentColumnMap.ric];
      const priceSeed = 100;

      const ask = priceSeed + spread / 2;
      const askSize = random(1000, 3000);
      const bid = priceSeed - spread / 2;
      const bidSize = random(1000, 3000);
      const close = priceSeed + random(0, 1) / 10;
      const last = priceSeed + random(0, 1) / 10;
      const open = priceSeed + random(0, 1) / 10;
      const phase = "C";
      const scenario = "close";
      const lastUpdate = now;
      const created = now;
      return [
        ask,
        askSize,
        bid,
        bidSize,
        close,
        last,
        open,
        phase,
        ric,
        scenario,
        lastUpdate,
        created,
        "",
      ];
    },
  );

  // prettier-ignore
  for (const [, , , lastTrade, ric] of basketConstituentData) {
  const priceSeed = parseFloat(String(lastTrade));
  if (!isNaN(priceSeed)) {
    const spread = random(0, 10);
    const ask = priceSeed + spread / 2;
    const askSize = random(1000, 3000);
    const bid = priceSeed - spread / 2;
    const bidSize = random(1000, 3000);
    const close = priceSeed + random(0, 1) / 10;
    const last = priceSeed + random(0, 1) / 10;
    const open = priceSeed + random(0, 1) / 10;
    const phase = "C";
    const scenario = "close";
    pricesData.push([
      ask,
      askSize,
      bid,
      bidSize,
      close,
      last,
      open,
      phase,
      ric as string,
      scenario,
      lastUpdate,
      created,
      "",
    ]);
  }
}

  return pricesData;
});

export type PricesTableOptions = {
  /**
   * Start ticking prices immediately. Default false, call
   * `updateGenerator.start()`.
   */
  autoStart?: boolean;
};

export type PricesTable = {
  table: Table;
  updateGenerator?: BaseUpdateGenerator;
};

export const createPricesTable = ({
  autoStart = false,
}: PricesTableOptions = {}) => {
  const map = buildDataColumnMap(schemas, "prices");
  const { bid, bidSize, ask, askSize } = map;
  const updateGenerator = new BaseUpdateGenerator(
    { bid, bidSize, ask, askSize },
    { autoStart },
  );
  const table = createTable(
    schemas.prices,
    cloneRows(getPricesData()),
    map,
    updateGenerator,
  );
  return { table, updateGenerator } as PricesTable & {
    updateGenerator: BaseUpdateGenerator;
  };
};
