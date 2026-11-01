import { forEachElement, tag } from "./text";

/** ESMA FITRS equity transparency calculations for one ISIN. */
export interface FitrsEquity {
  avgDailyTrades?: number;
  avgDailyTurnover?: number;
  /** FinInstrmClssfctn, e.g. SHRS, DPRS */
  classification: string;
  isin: string;
  liquid: boolean;
  /** most relevant market in terms of liquidity (MIC) */
  relevantMic?: string;
  /** average daily number of transactions on the most relevant market */
  relevantMarketTrades?: number;
}

const toNumber = (value: string | undefined) =>
  value === undefined || value === "" ? undefined : Number(value);

/** Parse a FULECR_<date>_E file. */
export const parseFitrsEquities = (xml: string) => {
  const records = new Map<string, FitrsEquity>();
  forEachElement(xml, "EqtyTrnsprncyData", (element) => {
    const isin = tag(element, "Id");
    if (!isin) {
      return;
    }
    const relevantMarket = element.indexOf("<RlvntMkt>");
    const statistics =
      relevantMarket === -1 ? element : element.slice(0, relevantMarket);
    records.set(isin, {
      avgDailyTrades: toNumber(tag(statistics, "AvrgDalyNbOfTxs")),
      avgDailyTurnover: toNumber(
        statistics.match(/<AvrgDalyTrnvr[^>]*>([^<]*)</)?.[1],
      ),
      classification: tag(element, "FinInstrmClssfctn") ?? "",
      isin,
      liquid: tag(element, "Lqdty") === "true",
      relevantMic:
        relevantMarket === -1 ? undefined : tag(element, "Id", relevantMarket),
      relevantMarketTrades:
        relevantMarket === -1
          ? undefined
          : toNumber(tag(element, "AvrgDalyNbOfTxs", relevantMarket)),
    });
  });
  return records;
};
