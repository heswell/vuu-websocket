export const InstrumentNL = (
  bbg: string,
  currency: string,
  description: string,
  exchange: string,
  isin: string,
  lotSize: number,
  ric: string
) =>
  JSON.stringify({
    bbg,
    currency,
    description,
    exchange,
    isin,
    lotSize,
    ric,
  }) + "\n";
