export interface InstrumentDto {
  bbg: string;
  currency: string;
  description: string;
  exchange: string;
  isin: string;
  lotSize: number;
  ric: string;
}

export const Instrument = (
  bbg: string,
  currency: string,
  description: string,
  exchange: string,
  isin: string,
  lotSize: number,
  ric: string
): InstrumentDto => ({
  bbg,
  currency,
  description,
  exchange,
  isin,
  lotSize,
  ric,
});
