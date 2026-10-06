/**
 * Smoke test the built (dist) @heswell/vuu-table and @heswell/vuu-viewport
 * packages as an external consumer would see them: plain Node ESM resolution
 * of the published entry points, and a strict node16 typecheck of the
 * published declarations. Run `npm run build:packages` first.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The built packages are copied, so vuu-viewport resolves the dist
// vuu-table rather than the workspace source. Peers are symlinked so their
// own dependencies resolve from the repo node_modules.
const COPIES: Record<string, string> = {
  "@heswell/vuu-table": "dist/vuu-table",
  "@heswell/vuu-viewport": "dist/vuu-viewport",
};
const LINKS: Record<string, string> = {
  "@vuu-ui/vuu-data-types": "node_modules/@vuu-ui/vuu-data-types",
  "@vuu-ui/vuu-filter-parser": "node_modules/@vuu-ui/vuu-filter-parser",
  "@vuu-ui/vuu-filter-types": "node_modules/@vuu-ui/vuu-filter-types",
  "@vuu-ui/vuu-protocol-types": "node_modules/@vuu-ui/vuu-protocol-types",
};

const CONSUMER = `import { Table, JoinTable } from "@heswell/vuu-table";
import { InMemoryViewport, inMemoryDataEngine } from "@heswell/vuu-viewport";

const prices = new Table({
  table: { module: "SIMUL", table: "prices" },
  key: "ric",
  columns: [
    { name: "ric", serverDataType: "string" },
    { name: "bid", serverDataType: "double" },
  ],
});
prices.upsert(["VOD.L", 101.5]);
prices.upsert(["VOD.N", 99.5]);
prices.upsert(["BP.L", 200]);

const viewport = new InMemoryViewport(prices, {
  id: "vp-1",
  columns: ["ric", "bid"],
  range: { from: 0, to: 50 },
  sort: { sortDefs: [{ column: "bid", sortType: "D" }] },
  filterSpec: { filter: 'ric starts "V"' },
});
const { rows, size } = viewport.getCurrentRange();

if (size !== 2 || rows.length !== 2) {
  throw Error(\`expected 2 rows, got size=\${size} rows=\${rows.length}\`);
}
if (typeof JoinTable !== "function" || typeof inMemoryDataEngine !== "object") {
  throw Error("missing exports");
}
console.log("engine packages smoke test passed:", JSON.stringify(rows));
`;

const consumerDir = fs.mkdtempSync(path.join(os.tmpdir(), "vuu-engine-smoke-"));
try {
  const install = (packages: Record<string, string>, copy: boolean) => {
    for (const [name, target] of Object.entries(packages)) {
      const source = path.join(ROOT, target);
      if (!fs.existsSync(path.join(source, "package.json"))) {
        throw Error(`${source} not found, run npm run build:packages first`);
      }
      const installPath = path.join(consumerDir, "node_modules", name);
      fs.mkdirSync(path.dirname(installPath), { recursive: true });
      if (copy) {
        fs.cpSync(source, installPath, { recursive: true });
      } else {
        fs.symlinkSync(source, installPath, "dir");
      }
    }
  };
  install(COPIES, true);
  install(LINKS, false);
  fs.writeFileSync(
    path.join(consumerDir, "package.json"),
    JSON.stringify({ name: "smoke", private: true, type: "module" }),
  );
  fs.writeFileSync(
    path.join(consumerDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "node16",
        moduleResolution: "node16",
        target: "es2022",
        lib: ["es2022", "dom"],
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        types: [],
      },
      files: ["consumer.ts"],
    }),
  );
  fs.writeFileSync(path.join(consumerDir, "consumer.ts"), CONSUMER);
  // CONSUMER is also valid JavaScript.
  fs.writeFileSync(path.join(consumerDir, "consumer.mjs"), CONSUMER);

  // skipLibCheck is off so our published declarations are checked, but the
  // upstream @vuu-ui type packages have their own unresolved references, so
  // only errors in the consumer or our packages fail the check.
  let tscOutput = "";
  try {
    execFileSync(
      path.join(ROOT, "node_modules/.bin/tsc"),
      ["--project", "tsconfig.json", "--pretty", "false"],
      { cwd: consumerDir, encoding: "utf8" },
    );
  } catch (err) {
    tscOutput = (err as { stdout?: string }).stdout ?? String(err);
  }
  const errors = tscOutput
    .split("\n")
    .filter((line) => /error TS\d+/.test(line))
    .filter(
      (line) =>
        line.startsWith("consumer.ts") ||
        line.startsWith("node_modules/@heswell/"),
    );
  if (errors.length > 0) {
    throw Error(
      `published declarations failed typecheck:\n${errors.join("\n")}`,
    );
  }
  console.log("engine packages declarations typecheck passed");
  execFileSync("node", ["consumer.mjs"], {
    cwd: consumerDir,
    stdio: "inherit",
  });
} finally {
  fs.rmSync(consumerDir, { recursive: true, force: true });
}
