import { Table, UpdateTuple } from "@heswell/data";
import { VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import { scenarios } from "./reference-data/scenarios";
import { Module, Provider } from "@heswell/vuu-server";
import {
  random,
  setRandomBidAsk,
  setRandomBidAskSize,
  setRandomBidAskSizeUpdate,
  setRandomBidAskUpdate,
} from "../../../utils";

export class PricesProvider extends Provider {
  constructor(table: Table) {
    super(table, ["instruments"]);
  }

  async load(module: Module) {
    const {
      columnMap: { ric },
      rows: instruments,
    } = module.getTable("instruments");

    const row: Record<string, VuuRowDataItemType> = {};

    const bidAsk = { ask: 0, bid: 0 };
    const bidAskSize = { askSize: 0, bidSize: 0 };

    for (const instrument of instruments) {
      const scenario = scenarios[random(0, scenarios.length - 1)];

      setRandomBidAsk(bidAsk);
      setRandomBidAskSize(bidAskSize);

      row.ask = bidAsk.ask;
      row.askSize = bidAskSize.askSize;
      row.bid = bidAsk.bid;
      row.bidSize = bidAskSize.bidSize;
      row.close = 0;
      row.last = 0;
      row.phase = "C";
      row.ric = instrument[ric];
      row.scenario = scenario;

      this.insertRow(row);
    }

    this.loaded = true;

    this.beginUpdateLoop(module);
  }

  beginUpdateLoop(module: Module) {
    console.log("begin price update loop");
    const pricesTable = module.getTable("prices");
    const {
      columnMap: { ask, askSize, bid, bidSize },
      rowCount: priceCount,
      rows: prices,
    } = pricesTable;

    // each tick we'll issue updates for 10% of rows
    const updateCount = Math.round(priceCount / 10);

    // @ts-ignore
    const updates: UpdateTuple = [ask, 0, askSize, 0, bid, 0, bidSize, 0];
    const askValue = 1;
    const askSizeValue = 3;
    const bidValue = 5;
    const bidSizeValue = 7;

    const bidAsk = { ask: 0, bid: 0 };
    const bidAskSize = { askSize: 0, bidSize: 0 };

    setInterval(() => {
      // const start = performance.now();
      for (let i = 0; i < updateCount; i++) {
        const priceIdx = random(0, prices.length - 1);
        const priceRow = prices[priceIdx];

        bidAsk.ask = priceRow[ask] as number;
        bidAsk.bid = priceRow[bid] as number;
        bidAskSize.askSize = priceRow[askSize] as number;
        bidAskSize.bidSize = priceRow[bidSize] as number;

        setRandomBidAskUpdate(bidAsk);
        setRandomBidAskSizeUpdate(bidAskSize);

        // @ts-ignore
        updates[askValue] = bidAsk.ask;
        // @ts-ignore
        updates[bidValue] = bidAsk.bid;
        // @ts-ignore
        updates[askSizeValue] = bidAskSize.askSize;
        // @ts-ignore
        updates[bidSizeValue] = bidAskSize.bidSize;

        pricesTable.update(priceIdx, updates);
      }
      const end = performance.now();
      // console.log(
      //   `update cycle took ${
      //     end - start
      //   } ms (updating ${updateCount} price rows)`
      // );
    }, 250);
  }
}
