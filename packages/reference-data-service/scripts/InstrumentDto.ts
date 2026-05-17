export const InstrumentNL = (
  bbg: string,
  currency: string,
  description: string,
  exchange: string,
  isin: string,
  lotSize: number,
  ric: string,
  delay = 100
) =>
  JSON.stringify({
    data: {
      bbg,
      currency,
      description,
      exchange,
      isin,
      lotSize,
      ric,
    },
    delay,
  }) + "\n";
