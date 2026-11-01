import { parseCsvLine } from "./text";

/** ISO 10383 market identifier code. */
export interface MarketIdentifier {
  country: string;
  mic: string;
  name: string;
  operatingMic: string;
}

/** Parse the ISO10383_MIC.csv published by iso20022.org. */
export const parseMicCsv = (csv: string) => {
  const lines = csv.split(/\r?\n/).filter((line) => line.length > 0);
  const header = parseCsvLine(lines[0]);
  const column = (name: string) => {
    const index = header.indexOf(name);
    if (index === -1) {
      throw Error(`ISO 10383 csv has no ${name} column`);
    }
    return index;
  };
  const MIC = column("MIC");
  const OPERATING_MIC = column("OPERATING MIC");
  const NAME = column("MARKET NAME-INSTITUTION DESCRIPTION");
  const COUNTRY = column("ISO COUNTRY CODE (ISO 3166)");
  const mics = new Map<string, MarketIdentifier>();
  for (const line of lines.slice(1)) {
    const fields = parseCsvLine(line);
    mics.set(fields[MIC], {
      country: fields[COUNTRY],
      mic: fields[MIC],
      name: fields[NAME].replace(/\s+/g, " ").trim(),
      operatingMic: fields[OPERATING_MIC] || fields[MIC],
    });
  }
  return mics;
};
