import { parseCsvLine } from "./text";

export interface LegalEntity {
  country: string;
  lei: string;
  name: string;
}

/**
 * From the GLEIF relationship record (RR) golden copy csv, map each child
 * LEI in `leis` to its ultimate parent, or direct parent if no ultimate
 * parent is reported. Only ACTIVE accounting consolidation relationships.
 */
export const parseParents = (csv: string, leis: ReadonlySet<string>) => {
  const ultimate = new Map<string, string>();
  const direct = new Map<string, string>();
  let pos = csv.indexOf("\n") + 1;
  while (pos > 0 && pos < csv.length) {
    const next = csv.indexOf("\n", pos);
    const end = next === -1 ? csv.length : next;
    // cheap prefilter on the quoted child LEI before parsing the line
    const child = csv.slice(pos + 1, pos + 21);
    if (leis.has(child)) {
      const [, , parent, , type, status] = parseCsvLine(
        csv.slice(pos, end).replace(/\r$/, ""),
      );
      if (status === "ACTIVE" && parent !== child) {
        if (type === "IS_ULTIMATELY_CONSOLIDATED_BY") {
          ultimate.set(child, parent);
        } else if (type === "IS_DIRECTLY_CONSOLIDATED_BY") {
          direct.set(child, parent);
        }
      }
    }
    pos = end + 1;
  }
  for (const [child, parent] of direct) {
    if (!ultimate.has(child)) {
      ultimate.set(child, parent);
    }
  }
  return ultimate;
};

interface LeiRecordsResponse {
  data: Array<{
    attributes: {
      entity: {
        legalAddress: { country: string };
        legalName: { name: string };
      };
      lei: string;
    };
  }>;
}

export const toLegalEntities = ({ data }: LeiRecordsResponse) =>
  data.map<LegalEntity>(({ attributes: { entity, lei } }) => ({
    country: entity.legalAddress.country,
    lei,
    name: entity.legalName.name,
  }));

const GLEIF_API = "https://api.gleif.org/api/v1/lei-records";
const BATCH_SIZE = 200;

/** Look up LEIs not already in `cache` via the GLEIF API (60 req/min). */
export const fetchLegalEntities = async (
  leis: Iterable<string>,
  cache: Record<string, LegalEntity | null>,
  onBatch: () => void = () => undefined,
) => {
  const missing = [...new Set(leis)].filter((lei) => !(lei in cache));
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const url = `${GLEIF_API}?filter%5Blei%5D=${batch.join(",")}&page%5Bsize%5D=${BATCH_SIZE}`;
    const started = performance.now();
    const response = await fetch(url);
    if (!response.ok) {
      throw Error(`GLEIF ${response.status} ${await response.text()}`);
    }
    for (const lei of batch) {
      cache[lei] = null;
    }
    for (const entity of toLegalEntities(await response.json())) {
      cache[entity.lei] = entity;
    }
    onBatch();
    await Bun.sleep(Math.max(0, 1000 - (performance.now() - started)));
  }
  return cache;
};
