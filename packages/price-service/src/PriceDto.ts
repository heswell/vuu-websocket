export interface PriceDto {
  ask: number;
  askSize: number;
  bid: number;
  bidSize: number;
  close: number;
  last: number;
  open: number;
  phase: string;
  ric: string;
  scenario: string;
}

export const Price = (
  ask: number,
  askSize: number,
  bid: number,
  bidSize: number,
  close: number,
  last: number,
  open: number,
  phase: string,
  ric: string,
  scenario: string
): PriceDto => ({
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
});
