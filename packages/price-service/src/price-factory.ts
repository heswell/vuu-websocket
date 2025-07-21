import { Clock, accurateTimer, random } from "@heswell/service-utils";
import PriceStore from "./PriceStore";
import logger from "./logger";
import { setRandomBidAsk, setRandomBidAskSize } from "./utils";
import { Price } from "./PriceDto";
import { getRandomPriceChange } from "./price-utils";

let lastTime = Clock.baseTime;

export const scenarios = ["fastTick", "widenBidAndAsk", "walkBidAsk"];

// The Store is ready when instruments are loaded
await PriceStore.ready;

const {
  columnMap: { ric: RIC },
  rows: instruments,
} = PriceStore.instrumentsTable;

let count = 0;
let updatesPerSecondCount = 0;

function createInitialSnapshot() {
  const start = performance.now();
  const created = Date.now();

  const bidAsk = { ask: 0, bid: 0 };
  const bidAskSize = { askSize: 0, bidSize: 0 };

  for (const instrument of instruments) {
    setRandomBidAsk(bidAsk);
    setRandomBidAskSize(bidAskSize);

    const ask = bidAsk.ask;
    const askSize = bidAskSize.askSize;
    const bid = bidAsk.bid;
    const bidSize = bidAskSize.bidSize;
    const close = 0;
    const last = 0;
    const open = 0;
    const phase = "C";
    const ric = instrument[RIC] as string;
    const scenario = scenarios[random(0, scenarios.length - 1)];

    PriceStore.addPrice(
      Price(ask, askSize, bid, bidSize, close, last, open, phase, ric, scenario)
    );

    count += 1;
  }

  const end = performance.now();
  console.log(
    `[PRICES:service:prices-factory] took ${
      end - start
    }ms to create prices for ${count} instruments`
  );
}

const UpdateParams = {
  UPDATES_PER_BATCH: 0,
  UPDATE_LOOP_INTERVAL: 0,
};

let updateGenerationRunning = false;
let currentNewOrderTimer: number | Timer | null = null;

function generatePriceUpdates() {
  // TODO can we have sub-ms times ?
  // const time = Clock.currentTime;

  const { UPDATE_LOOP_INTERVAL, UPDATES_PER_BATCH } = UpdateParams;

  const data = PriceStore.getSnapshot("prices");
  const count = data.length;
  // const count = 10;

  for (let i = 0; i < UPDATES_PER_BATCH; i++) {
    const rowIdx = random(0, count);

    const priceRow = data[rowIdx] as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      string,
      string,
      string
    ];

    if (priceRow) {
      // prettier-ignore
      const [ ask, askSize, bid, bidSize, close, last, open, phase, ric, scenario ] = priceRow

      const priceChange = getRandomPriceChange();

      PriceStore.updatePrice([
        ask + priceChange,
        askSize * (random(1, 15) / 10),
        bid + priceChange,
        bidSize * (random(1, 15) / 10),
        close,
        last + 1,
        open,
        phase,
        ric,
        scenario,
      ]);
    } else {
      console.warn(
        `[PRICES:service:pricefactory] no row at rowIdx [${rowIdx}] (data length ${count})`
      );
    }
  }
  updatesPerSecondCount += UPDATES_PER_BATCH;

  if (updateGenerationRunning) {
    currentNewOrderTimer = setTimeout(
      generatePriceUpdates,
      UPDATE_LOOP_INTERVAL
    );
  }
}

function logUpdateRate() {
  if (updatesPerSecondCount > 0) {
    console.log(`generated ${updatesPerSecondCount} updates / second}`);
  }
  updatesPerSecondCount = 0;
}

export function startGeneratingUpdates({
  updatesPerSecond = 1,
}: {
  updatesPerSecond?: number;
}) {
  logger.info(
    `[PRICES:service:prices-factory] START generating price updates : ${updatesPerSecond} per second`
  );
  console.log(
    `[PRICES:service:prices-factory] START generating price updates ${updatesPerSecond} per second`
  );
  updateGenerationRunning = true;

  const { updateInterval, updatesPerBatch } =
    calculateUpdateFrequency(updatesPerSecond);

  UpdateParams.UPDATE_LOOP_INTERVAL = updateInterval;
  UpdateParams.UPDATES_PER_BATCH = updatesPerBatch;

  generatePriceUpdates();
}

export function stopGeneratingUpdates() {
  logger.info(`[PRICES:service:prices-factory] STOP generating price updates`);
  console.log(`[PRICES:service:prices-factory] STOP generating price updates`);
  updateGenerationRunning = false;
  if (currentNewOrderTimer) {
    clearTimeout(currentNewOrderTimer);
    currentNewOrderTimer = null;
  }
}

accurateTimer(logUpdateRate, 1000);

function calculateUpdateFrequency(updatesPerSecond: number) {
  if (updatesPerSecond > 10000) {
    throw Error(
      `[PRICES:service:prices-factory] cannot generate > 10,000 price updates per second`
    );
  } else if (updatesPerSecond > 1000) {
    return {
      updateInterval: 100,
      updatesPerBatch: Math.ceil(updatesPerSecond / 10),
    };
  } else if (updatesPerSecond > 100) {
    return {
      updateInterval: 250,
      updatesPerBatch: Math.ceil(updatesPerSecond / 4),
    };
  } else if (updatesPerSecond > 10) {
    return {
      updateInterval: 1000,
      updatesPerBatch: updatesPerSecond,
    };
  } else {
    return {
      updateInterval: 1000,
      updatesPerBatch: updatesPerSecond,
    };
  }
}

createInitialSnapshot();
startGeneratingUpdates({ updatesPerSecond: 10000 });
