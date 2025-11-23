import logger from "./logger";
import instrumentStore from "./InstrumentStore";
import path, { resolve } from "path";
import { DataGenerator } from "./DataGenerator";

const dataPath = path.resolve(
  import.meta.path,
  "../../data/instruments.ndjson"
);
const dataFile = Bun.file(dataPath);

const [stream] = await Promise.all([dataFile.stream(), instrumentStore.ready]);

async function loadInstruments() {
  logger.info("[RefData:service:instrument-factory] load instruments");
  const decoder = new TextDecoder();
  const start = performance.now();
  let count = 0;

  let remainingData = "";

  for await (const chunk of stream) {
    const str = decoder.decode(chunk);
    remainingData += str;
    let lines = remainingData.split(/\r?\n/);
    for await (const record of new DataGenerator(lines, 100)) {
      instrumentStore.addInstrument(JSON.parse(record));
      count += 1;
    }
    remainingData = lines.at(-1) ?? "";
  }

  const end = performance.now();
  console.log(
    `[RefData:service:instrument-factory] loaded ${count} instruments in ${
      end - start
    }ms`
  );
}
loadInstruments();
