import { describe, expect, test } from "bun:test";
import {
  assetClassFromCfi,
  ricFor,
  tickSizeBand,
  toEquity,
} from "../scripts/sources/equities";
import { parseFirdsEquities } from "../scripts/sources/firds";
import { parseFitrsEquities } from "../scripts/sources/fitrs";
import { parseParents } from "../scripts/sources/gleif";
import { parseMicCsv } from "../scripts/sources/mic";
import { selectListing } from "../scripts/sources/openfigi";
import { decodeXml, parseCsvLine } from "../scripts/sources/text";

const FITRS_XML = `<Document><EqtyTrnsprncyData>
  <Id>NL0010273215</Id>
  <FinInstrmClssfctn>SHRS</FinInstrmClssfctn>
  <Lqdty>true</Lqdty>
  <Sttstcs>
    <AvrgDalyTrnvr Ccy="EUR">1240000000</AvrgDalyTrnvr>
    <AvrgDalyNbOfTxs>80136.46</AvrgDalyNbOfTxs>
  </Sttstcs>
  <RlvntMkt><Id>XAMS</Id><AvrgDalyNbOfTxs>31512.1</AvrgDalyNbOfTxs></RlvntMkt>
</EqtyTrnsprncyData>
<EqtyTrnsprncyData>
  <Id>DE0007164600</Id>
  <FinInstrmClssfctn>SHRS</FinInstrmClssfctn>
  <Lqdty>false</Lqdty>
</EqtyTrnsprncyData></Document>`;

const firdsRecord = (isin: string, mic: string, name: string) =>
  `<RefData><FinInstrmGnlAttrbts><Id>${isin}</Id><FullNm>${name}</FullNm>` +
  `<ClssfctnTp>ESVUFR</ClssfctnTp><NtnlCcy>EUR</NtnlCcy></FinInstrmGnlAttrbts>` +
  `<Issr>724500Y6DUVHQD6OXN27</Issr><TradgVnRltdAttrbts><Id>${mic}</Id>` +
  `</TradgVnRltdAttrbts></RefData>`;

describe("text", () => {
  test("parseCsvLine handles quotes, escaped quotes, empty fields", () => {
    expect(parseCsvLine('"a","b, c","say ""hi""","",x,')).toEqual([
      "a",
      "b, c",
      'say "hi"',
      "",
      "x",
      "",
    ]);
  });

  test("decodeXml decodes entities", () => {
    expect(decodeXml("AT&amp;T &lt;1&gt;")).toBe("AT&T <1>");
  });
});

describe("FITRS", () => {
  test("parses statistics and the relevant market", () => {
    const records = parseFitrsEquities(FITRS_XML);
    expect(records.get("NL0010273215")).toEqual({
      avgDailyTrades: 80136.46,
      avgDailyTurnover: 1240000000,
      classification: "SHRS",
      isin: "NL0010273215",
      liquid: true,
      relevantMic: "XAMS",
      relevantMarketTrades: 31512.1,
    });
    expect(records.get("DE0007164600")).toMatchObject({
      avgDailyTrades: undefined,
      liquid: false,
      relevantMic: undefined,
    });
  });
});

describe("FIRDS", () => {
  test("keeps one record per ISIN, preferring the relevant venue", () => {
    const xml = [
      firdsRecord("NL0010273215", "XFRA", "ASML HOLDING NV"),
      firdsRecord("NL0010273215", "XAMS", "ASML HOLDING NV"),
      firdsRecord("NL0010273215", "XBER", "ASML HOLDING NV"),
      firdsRecord("XX0000000000", "XAMS", "IGNORED"),
    ].join("\n");
    const records = parseFirdsEquities(
      xml,
      new Set(["NL0010273215"]),
      (_, mic) => mic === "XAMS",
    );
    expect(records.size).toBe(1);
    expect(records.get("NL0010273215")).toEqual({
      cfi: "ESVUFR",
      currency: "EUR",
      fullName: "ASML HOLDING NV",
      isin: "NL0010273215",
      issuerLei: "724500Y6DUVHQD6OXN27",
      mic: "XAMS",
    });
  });
});

describe("ISO 10383", () => {
  test("maps segment MICs to operating MICs", () => {
    const csv = [
      '"MIC","OPERATING MIC","OPRT/SGMT","MARKET NAME-INSTITUTION DESCRIPTION","ISO COUNTRY CODE (ISO 3166)","COMMENTS"',
      '"XMIL","XMIL","OPRT","BORSA ITALIANA S.P.A.","IT",""',
      '"MTAA","XMIL","SGMT","EURONEXT  MILAN","IT","main, ""regulated"" market"',
    ].join("\r\n");
    const mics = parseMicCsv(csv);
    expect(mics.get("MTAA")).toEqual({
      country: "IT",
      mic: "MTAA",
      name: "EURONEXT MILAN",
      operatingMic: "XMIL",
    });
  });
});

describe("GLEIF", () => {
  test("prefers the ultimate parent over the direct parent", () => {
    const row = (child: string, parent: string, type: string, status = "ACTIVE") =>
      `"${child}","LEI","${parent}","LEI","${type}","${status}"`;
    const A = "A".repeat(20);
    const B = "B".repeat(20);
    const C = "C".repeat(20);
    const P = "P".repeat(20);
    const U = "U".repeat(20);
    const csv = [
      '"StartNode.NodeID","StartNode.NodeIDType","EndNode.NodeID","EndNode.NodeIDType","RelationshipType","RelationshipStatus"',
      row(A, P, "IS_DIRECTLY_CONSOLIDATED_BY"),
      row(A, U, "IS_ULTIMATELY_CONSOLIDATED_BY"),
      row(B, P, "IS_DIRECTLY_CONSOLIDATED_BY"),
      row(C, U, "IS_ULTIMATELY_CONSOLIDATED_BY", "INACTIVE"),
      row(P, U, "IS_ULTIMATELY_CONSOLIDATED_BY"),
    ].join("\n");
    const parents = parseParents(csv, new Set([A, B, C]));
    expect(Object.fromEntries(parents)).toEqual({ [A]: U, [B]: P });
  });
});

describe("OpenFIGI", () => {
  const listings = [
    { exchCode: "GF", figi: "F1", compositeFIGI: "C1", ticker: "SAP", marketSector: "Equity" },
    { exchCode: "GR", figi: "C1", compositeFIGI: "C1", ticker: "SAP", marketSector: "Equity" },
    { exchCode: "GY", figi: "X1", compositeFIGI: "C1", ticker: "SAP", marketSector: "Equity" },
  ];

  test("prefers the venue listing, then the composite, then the first", () => {
    expect(selectListing(listings, "GY")?.exchCode).toBe("GY");
    expect(selectListing(listings, "NA")?.exchCode).toBe("GR");
    expect(selectListing(listings.slice(0, 1))?.exchCode).toBe("GF");
    expect(selectListing([])).toBeNull();
    expect(selectListing(undefined)).toBeNull();
  });
});

describe("equities", () => {
  test("tickSizeBand follows the RTS 11 liquidity bands", () => {
    expect([0, 9.9, 10, 79, 80, 599, 600, 1999, 2000, 8999, 9000].map((n) => tickSizeBand(n)))
      .toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6]);
    expect(tickSizeBand()).toBe(1);
  });

  test("ricFor uses the exchange suffix, falling back to the MIC", () => {
    expect(ricFor("ASML", "XAMS", "NL")).toBe("ASML.AS");
    expect(ricFor("ERIC B", "XSTO", "SE")).toBe("ERICB.ST");
    expect(ricFor("ABC", "ZZZZ", "ZZ")).toBe("ABC.ZZZZ");
  });

  test("assetClassFromCfi", () => {
    expect(assetClassFromCfi("ESVUFR")).toBe("Share");
    expect(assetClassFromCfi("EPNXXR")).toBe("Preferred Share");
    expect(assetClassFromCfi("EXXXXX", "DPRS")).toBe("Depositary Receipt");
    expect(assetClassFromCfi("EXXXXX", "SHRS")).toBe("Other Equity");
  });

  test("toEquity combines the sources", () => {
    expect(
      toEquity({
        firds: {
          cfi: "ESVUFR",
          currency: "EUR",
          fullName: "ASML HOLDING NV",
          isin: "NL0010273215",
          issuerLei: "724500Y6DUVHQD6OXN27",
          mic: "XAMS",
        },
        fitrs: {
          avgDailyTrades: 80136.46,
          avgDailyTurnover: 1240000000,
          classification: "SHRS",
          isin: "NL0010273215",
          liquid: true,
          relevantMarketTrades: 31512.1,
        },
        issuer: { country: "NL", lei: "724500Y6DUVHQD6OXN27", name: "ASML Holding N.V." },
        listing: { exchCode: "NA", figi: "BBG000C1HT37", ticker: "ASML" },
        parent: null,
        venue: { country: "NL", mic: "XAMS", name: "EURONEXT AMSTERDAM", operatingMic: "XAMS" },
      }),
    ).toEqual({
      assetClass: "Share",
      avgDailyTrades: 80136,
      avgDailyTurnover: 1240000000,
      bbg: "ASML NA",
      currency: "EUR",
      description: "ASML HOLDING NV",
      exchange: "XAMS",
      isin: "NL0010273215",
      issuerCountry: "NL",
      issuerName: "ASML Holding N.V.",
      liquid: true,
      lotSize: 1,
      parentName: null,
      ric: "ASML.AS",
      tickSizeBand: 6,
      venueName: "EURONEXT AMSTERDAM",
    });
  });
});
