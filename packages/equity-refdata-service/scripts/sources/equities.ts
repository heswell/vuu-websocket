import type { EquityDto } from "../../src/schema";
import { COUNTRY_EXCHANGE, EXCHANGES } from "./exchanges";
import type { FirdsEquity } from "./firds";
import type { FitrsEquity } from "./fitrs";
import type { LegalEntity } from "./gleif";
import type { MarketIdentifier } from "./mic";
import type { Listing } from "./openfigi";

const CFI_ASSET_CLASS: Record<string, string> = {
  C: "Convertible Share",
  D: "Depositary Receipt",
  F: "Preferred Convertible Share",
  L: "Limited Partnership Unit",
  P: "Preferred Share",
  R: "Preference Share",
  S: "Share",
  U: "Fund Unit",
  Y: "Structured Instrument",
};

/** Asset class from the CFI category (E) and group letters. */
export const assetClassFromCfi = (cfi: string, classification?: string) =>
  CFI_ASSET_CLASS[cfi[1]] ??
  (classification === "DPRS" ? "Depositary Receipt" : "Other Equity");

const TICK_SIZE_BAND_LIMITS = [10, 80, 600, 2000, 9000];

/**
 * MiFID II tick size liquidity band (1 to 6) from the average daily number
 * of transactions on the most liquid market (RTS 11). With the price, the
 * band determines the minimum tick size.
 */
export const tickSizeBand = (avgDailyTrades = 0) => {
  const index = TICK_SIZE_BAND_LIMITS.findIndex(
    (limit) => avgDailyTrades < limit,
  );
  return index === -1 ? 6 : index + 1;
};

export const ricFor = (ticker: string, operatingMic: string, country: string) => {
  const exchange = EXCHANGES[operatingMic] ?? EXCHANGES[COUNTRY_EXCHANGE[country]];
  const code = ticker.replace(/[\s/]+/g, "");
  return exchange ? `${code}${exchange.ric}` : `${code}.${operatingMic}`;
};

export const preferredExchCode = (operatingMic: string | undefined) =>
  operatingMic ? EXCHANGES[operatingMic]?.bbg : undefined;

export interface EquitySources {
  firds: FirdsEquity;
  fitrs: FitrsEquity;
  issuer?: LegalEntity | null;
  listing: Listing;
  parent?: LegalEntity | null;
  venue: MarketIdentifier;
}

export const toEquity = ({
  firds,
  fitrs,
  issuer,
  listing,
  parent,
  venue,
}: EquitySources): EquityDto => ({
  assetClass: assetClassFromCfi(firds.cfi, fitrs.classification),
  avgDailyTrades:
    fitrs.avgDailyTrades === undefined
      ? null
      : Math.round(fitrs.avgDailyTrades),
  avgDailyTurnover: fitrs.avgDailyTurnover ?? null,
  bbg: `${listing.ticker} ${listing.exchCode}`,
  currency: firds.currency,
  description: firds.fullName,
  exchange: venue.operatingMic,
  isin: firds.isin,
  issuerCountry: issuer?.country ?? null,
  issuerName: issuer?.name ?? null,
  liquid: fitrs.liquid,
  lotSize: 1,
  parentName: parent?.name ?? null,
  ric: ricFor(listing.ticker, venue.operatingMic, venue.country),
  tickSizeBand: tickSizeBand(
    fitrs.relevantMarketTrades ?? fitrs.avgDailyTrades,
  ),
  venueName: venue.name,
});
