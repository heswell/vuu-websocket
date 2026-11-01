/** One listing returned by the OpenFIGI mapping API. */
export interface FigiListing {
  compositeFIGI?: string;
  exchCode: string;
  figi: string;
  marketSector?: string;
  name?: string;
  securityType?: string;
  ticker: string;
}

export interface FigiResult {
  data?: FigiListing[];
  error?: string;
  warning?: string;
}

/** The listing we keep for an ISIN. */
export interface Listing {
  exchCode: string;
  figi: string;
  name?: string;
  securityType?: string;
  ticker: string;
}

/**
 * Prefer the listing on the instrument's most relevant venue, then the
 * country composite, then whatever comes first.
 */
export const selectListing = (
  listings: FigiListing[] | undefined,
  preferredExchCode?: string,
): Listing | null => {
  const equities = (listings ?? []).filter(
    (listing) =>
      listing.ticker && (listing.marketSector ?? "Equity") === "Equity",
  );
  const chosen =
    (preferredExchCode &&
      equities.find((listing) => listing.exchCode === preferredExchCode)) ||
    equities.find((listing) => listing.figi === listing.compositeFIGI) ||
    equities[0];
  return chosen
    ? {
        exchCode: chosen.exchCode,
        figi: chosen.figi,
        name: chosen.name,
        securityType: chosen.securityType,
        ticker: chosen.ticker,
      }
    : null;
};

const OPENFIGI_API = "https://api.openfigi.com/v3/mapping";

/**
 * Map ISINs not already in `cache` to listings. Without an API key
 * OpenFIGI allows 25 requests/minute of 10 jobs, with one 25 requests per
 * 6 seconds of 100 jobs. Rate limit headers are honoured.
 */
export const mapIsins = async (
  isins: Array<{ isin: string; preferredExchCode?: string }>,
  cache: Record<string, Listing | null>,
  {
    apiKey,
    log = console.log,
    onBatch = () => undefined,
  }: {
    apiKey?: string;
    log?: (message: string) => void;
    onBatch?: () => void;
  } = {},
) => {
  const jobsPerRequest = apiKey ? 100 : 10;
  const missing = isins.filter(({ isin }) => !(isin in cache));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["X-OPENFIGI-APIKEY"] = apiKey;
  }
  let done = 0;
  for (let i = 0; i < missing.length; ) {
    const batch = missing.slice(i, i + jobsPerRequest);
    const response = await fetch(OPENFIGI_API, {
      body: JSON.stringify(
        batch.map(({ isin }) => ({ idType: "ID_ISIN", idValue: isin })),
      ),
      headers,
      method: "POST",
    });
    const reset = Number(response.headers.get("ratelimit-reset") ?? 60);
    if (response.status === 429) {
      await Bun.sleep((reset + 1) * 1000);
      continue;
    }
    if (!response.ok) {
      throw Error(`OpenFIGI ${response.status} ${await response.text()}`);
    }
    const results = (await response.json()) as FigiResult[];
    batch.forEach(({ isin, preferredExchCode }, index) => {
      cache[isin] = selectListing(results[index]?.data, preferredExchCode);
    });
    i += batch.length;
    done += batch.length;
    onBatch();
    if (done % (jobsPerRequest * 25) < jobsPerRequest) {
      log(`OpenFIGI ${done}/${missing.length}`);
    }
    if (response.headers.get("ratelimit-remaining") === "0") {
      await Bun.sleep((reset + 1) * 1000);
    }
  }
  return cache;
};
