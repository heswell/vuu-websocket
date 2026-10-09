/**
 * Builds data/equities.ndjson from public sources:
 *
 *   ESMA FITRS  equity transparency: universe, liquidity, turnover, venue
 *   ESMA FIRDS  instrument reference data: name, CFI, currency, issuer LEI
 *   ISO 10383   market identifier codes: venue names
 *   GLEIF       issuer legal name, country and parent (LEI records, RR file)
 *   OpenFIGI    ticker and Bloomberg exchange code
 *
 * Downloads and API results are cached in .cache/, so the script can be
 * interrupted and resumed. Without OPENFIGI_API_KEY the OpenFIGI step is
 * rate limited to 250 ISINs per minute (about 100 minutes in total).
 *
 * usage: bun scripts/fetch-equities.ts [--cached-only]
 *   --cached-only  skip OpenFIGI lookups not already cached
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { EquityDto } from "../src/schema";
import { preferredExchCode, toEquity } from "./sources/equities";
import { parseFirdsEquities, type FirdsEquity } from "./sources/firds";
import { parseFitrsEquities } from "./sources/fitrs";
import {
  fetchLegalEntities,
  parseParents,
  type LegalEntity,
} from "./sources/gleif";
import { parseMicCsv } from "./sources/mic";
import { mapIsins, type Listing } from "./sources/openfigi";

const { values: args } = parseArgs({
  options: { "cached-only": { type: "boolean" } },
});

const ROOT = path.resolve(import.meta.dir, "..");
const CACHE = path.join(ROOT, ".cache");
const OUTPUT = path.join(ROOT, "data/equities.ndjson");
const SOURCES = path.join(ROOT, "data/SOURCES.md");
const MIC_URL =
  "https://www.iso20022.org/sites/default/files/ISO10383_MIC/ISO10383_MIC.csv";
const ESMA_SOLR = "https://registers.esma.europa.eu/solr";
const GLEIF_GOLDEN_COPY =
  "https://goldencopy.gleif.org/api/v2/golden-copies/publishes/latest";

fs.mkdirSync(CACHE, { recursive: true });

const log = (message: string) =>
  console.log(`${new Date().toISOString().slice(11, 19)} ${message}`);

/** Download url to .cache (once), unzip if needed, return the data file. */
const download = async (url: string) => {
  const name = path.basename(new URL(url).pathname);
  const file = path.join(CACHE, name);
  if (!fs.existsSync(file)) {
    log(`downloading ${url}`);
    // curl rather than fetch: Bun's fetch stalls on some ESMA file hosts
    const curl = Bun.spawnSync(
      ["curl", "-fsSL", "--retry", "3", "-o", `${file}.part`, url],
      { stderr: "pipe" },
    );
    if (!curl.success) {
      throw Error(`${url}: ${curl.stderr.toString()}`);
    }
    fs.renameSync(`${file}.part`, file);
  }
  if (!name.endsWith(".zip")) {
    return file;
  }
  const dir = file.slice(0, -4);
  if (!fs.existsSync(dir)) {
    const unzip = Bun.spawnSync(["unzip", "-o", "-q", file, "-d", `${dir}.part`]);
    if (!unzip.success) {
      throw Error(`unzip ${file}: ${unzip.stderr.toString()}`);
    }
    fs.renameSync(`${dir}.part`, dir);
  }
  const [entry] = fs.readdirSync(dir);
  return path.join(dir, entry);
};

const readJson = <T>(file: string, fallback: T): T =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
const writeJson = (file: string, value: unknown) =>
  fs.writeFileSync(file, JSON.stringify(value));

interface SolrFile {
  download_link: string;
  file_name: string;
}

const solrFiles = async (core: string, query: string) => {
  const response = await fetch(`${ESMA_SOLR}/${core}/select?q=*&wt=json&rows=200&${query}`);
  const { response: body } = (await response.json()) as {
    response: { docs: SolrFile[] };
  };
  return body.docs;
};

/** All parts of the most recent file whose name matches pattern. */
const latest = (files: SolrFile[], pattern: RegExp) => {
  const matching = files.filter(({ file_name }) => pattern.test(file_name));
  const date = matching
    .map(({ file_name }) => file_name.match(/_(\d{8})_/)![1])
    .sort()
    .at(-1);
  if (!date) {
    throw Error(`no file matching ${pattern}`);
  }
  return matching.filter(({ file_name }) => file_name.includes(`_${date}_`));
};

// 1. FITRS: the equity universe with liquidity statistics
const fitrsFiles = latest(
  await solrFiles(
    "esma_registers_fitrs_files",
    "fq=instrument_type:Equity*&fq=file_type:Full&sort=creation_date%20desc",
  ),
  /^FULECR_\d{8}_E_/,
);
const fitrs = new Map(
  (
    await Promise.all(
      fitrsFiles.map(async ({ download_link }) => [
        ...parseFitrsEquities(await Bun.file(await download(download_link)).text()),
      ]),
    )
  ).flat(),
);
for (const [isin, record] of fitrs) {
  if (record.classification !== "SHRS" && record.classification !== "DPRS") {
    fitrs.delete(isin);
  }
}
log(`FITRS: ${fitrs.size} shares and depositary receipts`);

// 2. ISO 10383 market identifiers
const mics = parseMicCsv(await Bun.file(await download(MIC_URL)).text());
const operatingMic = (mic: string | undefined) =>
  mic === undefined ? undefined : (mics.get(mic)?.operatingMic ?? mic);
log(`ISO 10383: ${mics.size} MICs`);

// 3. FIRDS: reference data, preferring the most relevant market's record
const firdsFiles = latest(
  await solrFiles(
    "esma_registers_firds_files",
    "fq=file_type:FULINS&sort=publication_date%20desc",
  ),
  /^FULINS_E_\d{8}_/,
);
const firds = new Map<string, FirdsEquity>();
const isins = new Set(fitrs.keys());
const isPreferredVenue = (isin: string, mic: string) =>
  operatingMic(mic) === operatingMic(fitrs.get(isin)?.relevantMic);
for (const { download_link } of firdsFiles) {
  const xml = await Bun.file(await download(download_link)).text();
  parseFirdsEquities(xml, isins, isPreferredVenue, firds);
}
log(`FIRDS: ${firds.size} of ${fitrs.size} found in ${firdsFiles.length} files`);

// 4. GLEIF: issuers and their parents
const gleifCacheFile = path.join(CACHE, "gleif-entities.json");
const entities = readJson<Record<string, LegalEntity | null>>(gleifCacheFile, {});
const issuerLeis = new Set(
  [...firds.values()].flatMap(({ issuerLei }) => (issuerLei ? [issuerLei] : [])),
);
const goldenCopy = (await (await fetch(GLEIF_GOLDEN_COPY)).json()) as {
  data: { rr: { full_file: { csv: { url: string } } } };
};
const parents = parseParents(
  await Bun.file(await download(goldenCopy.data.rr.full_file.csv.url)).text(),
  issuerLeis,
);
await fetchLegalEntities([...issuerLeis, ...parents.values()], entities, () =>
  writeJson(gleifCacheFile, entities),
);
writeJson(gleifCacheFile, entities);
log(`GLEIF: ${issuerLeis.size} issuers, ${parents.size} with parents`);

// 5. OpenFIGI: tickers, most traded first so a partial run is useful
const figiCacheFile = path.join(CACHE, "openfigi.json");
const listings = readJson<Record<string, Listing | null>>(figiCacheFile, {});
const byTurnover = [...firds.keys()].sort(
  (a, b) =>
    (fitrs.get(b)!.avgDailyTurnover ?? 0) - (fitrs.get(a)!.avgDailyTurnover ?? 0),
);
if (!args["cached-only"]) {
  let batches = 0;
  await mapIsins(
    byTurnover.map((isin) => ({
      isin,
      preferredExchCode: preferredExchCode(operatingMic(fitrs.get(isin)!.relevantMic)),
    })),
    listings,
    {
      apiKey: process.env.OPENFIGI_API_KEY,
      log,
      onBatch: () => {
        if (++batches % 10 === 0) {
          writeJson(figiCacheFile, listings);
        }
      },
    },
  );
  writeJson(figiCacheFile, listings);
}

// 6. Build rows, one per RIC, keeping the most traded on a collision
const equities = new Map<string, EquityDto>();
let unmapped = 0;
let collisions = 0;
for (const isin of byTurnover) {
  const listing = listings[isin];
  const record = firds.get(isin)!;
  const fitrsRecord = fitrs.get(isin)!;
  const venue =
    mics.get(operatingMic(fitrsRecord.relevantMic) ?? "") ??
    mics.get(operatingMic(record.mic) ?? "");
  if (!listing || !venue) {
    unmapped += 1;
    continue;
  }
  const parentLei = record.issuerLei ? parents.get(record.issuerLei) : undefined;
  const equity = toEquity({
    firds: record,
    fitrs: fitrsRecord,
    issuer: record.issuerLei ? entities[record.issuerLei] : undefined,
    listing,
    parent: parentLei ? entities[parentLei] : undefined,
    venue: mics.get(venue.operatingMic) ?? venue,
  });
  if (equities.has(equity.ric)) {
    collisions += 1;
  } else {
    equities.set(equity.ric, equity);
  }
}
const rows = [...equities.values()].sort((a, b) => (a.ric < b.ric ? -1 : 1));
fs.writeFileSync(OUTPUT, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
log(
  `wrote ${rows.length} equities to ${path.relative(process.cwd(), OUTPUT)} ` +
    `(${unmapped} without ticker or venue, ${collisions} duplicate RICs)`,
);

fs.writeFileSync(
  SOURCES,
  `# Equity reference data sources

\`equities.ndjson\` is generated by \`npm run fetch-data -w @heswell/equity-refdata-service\`
(\`scripts/fetch-equities.ts\`). Generated ${new Date().toISOString().slice(0, 10)}, ${rows.length} equities.

| Source | Files | Used for | Terms |
| --- | --- | --- | --- |
| [ESMA FITRS](https://registers.esma.europa.eu/publication/searchRegister?core=esma_registers_fitrs_files) | ${fitrsFiles.map(({ file_name }) => file_name).join(", ")} | Universe, liquidity, turnover, trades, most relevant market | Source: ESMA. Reuse authorised with acknowledgement of the source. |
| [ESMA FIRDS](https://registers.esma.europa.eu/publication/searchRegister?core=esma_registers_firds_files) | ${firdsFiles.map(({ file_name }) => file_name).join(", ")} | ISIN, description, CFI, currency, issuer LEI | Source: ESMA. Reuse authorised with acknowledgement of the source. |
| [GLEIF](https://www.gleif.org/en/lei-data/gleif-golden-copy) | LEI records API, RR golden copy | Issuer name and country, parent company | CC0 1.0 |
| [ISO 10383](https://www.iso20022.org/market-identifier-codes) | ISO10383_MIC.csv | Venue names, operating MICs | Freely available |
| [OpenFIGI](https://www.openfigi.com) | Mapping API | Ticker and exchange code (\`bbg\`) | OpenFIGI terms of use |

RICs are derived from the ticker and a conventional exchange suffix (e.g.
\`.PA\`), they are not sourced from LSEG. \`lotSize\` is 1, FIRDS does not
publish lot sizes. \`tickSizeBand\` is the MiFID II (RTS 11) liquidity band
from the average daily number of transactions on the most relevant market.
`,
);
