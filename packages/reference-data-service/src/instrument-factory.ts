import { random } from "@heswell/service-utils";
import { Instrument } from "./InstrumentDto";
import instrumentStore from "./InstrumentStore";
import logger from "./logger";

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
const chars = Array.from("ABCDEFGHIJKLM");
// const chars = Array.from("ABCDEFGHIJKLMNOPQRS");

await instrumentStore.ready;

function createInstruments() {
  logger.info("[RefData:service:instrument-factory] load instruments");

  let count = 0;

  const start = performance.now();
  chars.forEach((c0) => {
    chars.forEach((c1) => {
      chars.forEach((c2) => {
        chars.forEach((c3) => {
          suffixes.forEach((suffix) => {
            const bbg = `${c0}${c1}${c2}${c3} ${suffix}`;
            const currency = currencies[random(0, 4)];
            const ric = `${c0}${c1}${c2}${c3}.${suffix}`;
            const isin = `${c0}${c1}${c2}${c3}`;
            const description = `${ric} ${locations[suffix][0]}`;
            const exchange = locations[suffix][1];
            const lotSize = random(10, 1000);

            instrumentStore.addInstrument(
              Instrument(
                bbg,
                currency,
                description,
                exchange,
                isin,
                lotSize,
                ric
              )
            );
            count += 1;
          });
        });
      });
    });
  });
  const end = performance.now();
  console.log(
    `[RefData:service:instrument-factory] generated ${count} instruments in ${
      end - start
    }ms`
  );
}

createInstruments();
