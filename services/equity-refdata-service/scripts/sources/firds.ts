import { tag } from "./text";

/** ESMA FIRDS reference data for one ISIN on one trading venue. */
export interface FirdsEquity {
  cfi: string;
  currency: string;
  fullName: string;
  isin: string;
  issuerLei?: string;
  /** trading venue (segment or operating MIC) */
  mic: string;
}

/**
 * Parse a FULINS_E file, keeping one record per ISIN in `isins`: the one
 * traded on the preferred venue if present, else the first seen.
 */
export const parseFirdsEquities = (
  xml: string,
  isins: ReadonlySet<string>,
  isPreferredVenue: (isin: string, mic: string) => boolean,
  records = new Map<string, FirdsEquity>(),
) => {
  const preferred = new Set<string>();
  const open = "<RefData>";
  const close = "</RefData>";
  let pos = xml.indexOf(open);
  while (pos !== -1) {
    const end = xml.indexOf(close, pos);
    if (end === -1) {
      break;
    }
    // the ISIN is the first <Id> in the record
    const idStart = xml.indexOf("<Id>", pos) + 4;
    const isin = xml.slice(idStart, xml.indexOf("</Id>", idStart));
    if (isins.has(isin) && !preferred.has(isin)) {
      const element = xml.slice(pos + open.length, end);
      const venues = element.indexOf("<TradgVnRltdAttrbts>");
      const mic = venues === -1 ? "" : (tag(element, "Id", venues) ?? "");
      if (isPreferredVenue(isin, mic) || !records.has(isin)) {
        records.set(isin, {
          cfi: tag(element, "ClssfctnTp") ?? "",
          currency: tag(element, "NtnlCcy") ?? "",
          fullName: tag(element, "FullNm") ?? "",
          isin,
          issuerLei: tag(element, "Issr"),
          mic,
        });
        if (isPreferredVenue(isin, mic)) {
          preferred.add(isin);
        }
      }
    }
    pos = xml.indexOf(open, end + close.length);
  }
  return records;
};
