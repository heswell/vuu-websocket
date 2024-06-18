function random(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// const chars = Array.from("ABCDEFGHIJKLMNOPQRS");
const chars = Array.from("ABCDEF");
const suffixes = ["L", "N", "OQ", "AS", "PA", "MI", "FR", "AT"];
const locations = {
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

const data: any[] = [];

chars.forEach((c0) => {
  chars.forEach((c1) => {
    chars.forEach((c2) => {
      chars.forEach((c3) => {
        suffixes.forEach((suffix) => {
          const ric = `${c0}${c1}${c2}${c3}.${suffix}`;
          const bbg = `${c0}${c1}${c2}${c3} ${suffix}`;
          const isin = `${c0}${c1}${c2}${c3}`;
          const description = `${ric} ${locations[suffix][0]}`;
          data.push({
            bbg,
            ric,
            isin,
            description,
            currency: currencies[random(0, 4)],
            exchange: locations[suffix][1],
            lotsize: random(10, 1000),
          });
        });
      });
    });
  });
});

console.log(`instruments data-generator created ${data.length} rows`);

export { data };
