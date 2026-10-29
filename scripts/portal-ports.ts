/**
 * Reads portal.ports.json, the single list of ports used by
 * `npm run start:portal:all`, and prepares the built UI in vuu-ui to match:
 * writes backend URLs into each module's config.json, checks that UI ports
 * match the build and the portal's module catalogue, and writes a
 * portal-serve config for the modules that are built.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type BackendPorts = { websocket: number; https?: number };
export type UiModule = { port: number; backend?: string; host?: boolean };

export type PortalPorts = {
  /** Absolute path of the vuu-ui checkout. */
  vuuUiDir: string;
  backend: Record<string, BackendPorts>;
  ui: Record<string, UiModule>;
};

export const repoRoot = path.resolve(import.meta.dir, "..");
/** VUU_PORTAL_PORTS_FILE points the launcher at a different ports file. */
export const portsFilePath = path.resolve(
  repoRoot,
  process.env.VUU_PORTAL_PORTS_FILE?.trim() || "portal.ports.json",
);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPort = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 65535;

/** Loads and checks portal.ports.json. Throws listing every problem found. */
export function loadPortalPorts(knownBackends: string[]): PortalPorts {
  const file: unknown = JSON.parse(fs.readFileSync(portsFilePath, "utf8"));
  const problems: string[] = [];
  const fail = (message: string) => problems.push(message);
  if (!isObject(file)) throw Error(`${portsFilePath}: expected an object`);

  const usedPorts = new Map<number, string>();
  const usePort = (port: unknown, owner: string) => {
    if (!isPort(port)) return fail(`${owner}: '${port}' is not a valid port`);
    const other = usedPorts.get(port);
    if (other) fail(`${owner}: port ${port} is also used by ${other}`);
    usedPorts.set(port, owner);
  };

  const backend: Record<string, BackendPorts> = {};
  if (!isObject(file.backend)) fail("backend: expected an object");
  for (const [name, value] of Object.entries(
    isObject(file.backend) ? file.backend : {},
  )) {
    if (!knownBackends.includes(name)) {
      fail(`backend.${name}: unknown server (known: ${knownBackends.join(", ")})`);
      continue;
    }
    if (!isObject(value)) {
      fail(`backend.${name}: expected an object`);
      continue;
    }
    usePort(value.websocket, `backend.${name}.websocket`);
    if (value.https !== undefined) usePort(value.https, `backend.${name}.https`);
    backend[name] = value as BackendPorts;
  }
  for (const name of knownBackends) {
    if (!backend[name]) fail(`backend.${name}: missing`);
  }

  const ui: Record<string, UiModule> = {};
  if (!isObject(file.ui)) fail("ui: expected an object");
  for (const [name, value] of Object.entries(isObject(file.ui) ? file.ui : {})) {
    if (!isObject(value)) {
      fail(`ui.${name}: expected an object`);
      continue;
    }
    usePort(value.port, `ui.${name}.port`);
    if (value.backend !== undefined && !backend[value.backend as string]) {
      fail(`ui.${name}.backend: no backend server named '${value.backend}'`);
    }
    ui[name] = value as UiModule;
  }
  const hosts = Object.keys(ui).filter((name) => ui[name].host);
  if (hosts.length !== 1) {
    fail(`ui: exactly one module needs "host": true (found ${hosts.length})`);
  }

  if (problems.length > 0) {
    throw Error(
      `Invalid ${path.basename(portsFilePath)}:\n  ${problems.join("\n  ")}`,
    );
  }

  const vuuUiDir = path.resolve(
    path.dirname(portsFilePath),
    process.env.VUU_UI_DIR?.trim() || String(file.vuuUiDir ?? ""),
  );
  return { vuuUiDir, backend, ui };
}

export const hostModule = (ports: PortalPorts) =>
  Object.keys(ports.ui).find((name) => ports.ui[name].host) as string;

export type UiPlan = {
  /** portal-serve config to start the UI with; unset when nothing can be served. */
  serveConfigPath?: string;
  /** UI modules that will be served. */
  served: string[];
  /** config.json files whose backend URLs were rewritten. */
  updated: string[];
  warnings: string[];
};

const readJson = (file: string): unknown =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : undefined;

const portOf = (url: URL) =>
  Number(url.port || (url.protocol === "https:" || url.protocol === "wss:" ? 443 : 80));

/** Points each built module at its backend and works out what to serve. */
export function prepareUi(ports: PortalPorts): UiPlan {
  const plan: UiPlan = { served: [], updated: [], warnings: [] };
  const warn = (message: string) => plan.warnings.push(message);
  const distDir = path.join(ports.vuuUiDir, "dist_portal");

  if (!fs.existsSync(ports.vuuUiDir)) {
    warn(
      `vuu-ui not found at ${ports.vuuUiDir}: set vuuUiDir in portal.ports.json or VUU_UI_DIR. Starting backend only.`,
    );
    return plan;
  }

  // Federation name (= mfScope in modules.yaml) of each built UI module.
  const scopes = new Map<string, string>();

  for (const [name, module] of Object.entries(ports.ui)) {
    const dir = path.join(distDir, name);
    if (
      !fs.existsSync(path.join(dir, "index.html")) ||
      !fs.existsSync(path.join(dir, "serve.json"))
    ) {
      warn(`${name} is not built (no ${dir}), not serving it. Run npm run build:mf in vuu-ui.`);
      continue;
    }
    plan.served.push(name);

    const manifest = readJson(path.join(dir, "mf-manifest.json"));
    const meta = isObject(manifest) ? manifest.metaData : undefined;
    if (isObject(meta)) {
      if (typeof meta.name === "string") scopes.set(meta.name, name);
      const publicPath = typeof meta.publicPath === "string" ? meta.publicPath : "";
      if (URL.canParse(publicPath) && portOf(new URL(publicPath)) !== module.port) {
        warn(
          `${name} was built for ${publicPath} but portal.ports.json serves it on port ${module.port}. Update publicPath in portal-examples/${name}/portal-build.json and rebuild.`,
        );
      }
    }

    if (module.backend) {
      const backend = ports.backend[module.backend];
      const configFile = path.join(dir, "config.json");
      const config = readJson(configFile);
      if (
        !isObject(config) ||
        typeof config.websocketUrl !== "string" ||
        (backend.https !== undefined && typeof config.restUrl !== "string")
      ) {
        warn(`${name}/config.json has no websocketUrl/restUrl to point at ${module.backend}`);
        continue;
      }
      const websocketUrl = new URL(config.websocketUrl);
      websocketUrl.port = String(backend.websocket);
      const updated: Record<string, unknown> = {
        ...config,
        websocketUrl: websocketUrl.toString(),
      };
      if (backend.https !== undefined) {
        const restUrl = new URL(config.restUrl as string);
        restUrl.port = String(backend.https);
        updated.restUrl = restUrl.toString();
      }
      if (
        updated.websocketUrl !== config.websocketUrl ||
        updated.restUrl !== config.restUrl
      ) {
        fs.writeFileSync(configFile, `${JSON.stringify(updated, null, 2)}\n`);
        plan.updated.push(name);
      }
    }
  }

  checkModuleCatalogue(ports, scopes, warn);

  const host = hostModule(ports);
  if (!plan.served.includes(host)) {
    warn(`The portal host (${host}) is not built, so the UI will not be served.`);
    plan.served = [];
    return plan;
  }

  const service = (name: string) => ({
    name,
    port: ports.ui[name].port,
    directory: path.join(distDir, name),
  });
  plan.serveConfigPath = path.join(
    os.tmpdir(),
    "vuu-websocket-portal-serve.config.json",
  );
  fs.writeFileSync(
    plan.serveConfigPath,
    JSON.stringify(
      {
        defaultHost: host,
        hosts: [service(host)],
        remotes: plan.served.filter((name) => name !== host).map(service),
      },
      null,
      2,
    ),
  );
  return plan;
}

/**
 * The portal loads each module from the mfUrl in its module catalogue. The
 * catalogue is seeded once from default-modules.yaml and then edited at
 * runtime, so it can drift from the ports here. Only warns: fix it in the
 * module admin page or in modules.yaml.
 */
function checkModuleCatalogue(
  ports: PortalPorts,
  scopes: Map<string, string>,
  warn: (message: string) => void,
) {
  const portalDir = path.join(repoRoot, "packages", "vuu-portal");
  const file = ["modules.yaml", "default-modules.yaml"]
    .map((name) => path.join(portalDir, name))
    .find((candidate) => fs.existsSync(candidate));
  if (!file) return;

  const catalogue: unknown = Bun.YAML.parse(fs.readFileSync(file, "utf8"));
  const modules =
    isObject(catalogue) && Array.isArray(catalogue.modules) ? catalogue.modules : [];
  const fileName = path.relative(repoRoot, file);

  for (const module of modules) {
    if (!isObject(module) || module.enabled === false) continue;
    const { mfUrl, mfScope, name } = module;
    if (typeof mfUrl !== "string" || !URL.canParse(mfUrl)) continue;
    const uiName = typeof mfScope === "string" ? scopes.get(mfScope) : undefined;
    const port = portOf(new URL(mfUrl));
    if (!uiName) {
      if (!Object.values(ports.ui).some((ui) => ui.port === port)) {
        warn(`${fileName}: ${name} loads from ${mfUrl}, which nothing in portal.ports.json serves.`);
      }
    } else if (ports.ui[uiName].port !== port) {
      warn(
        `${fileName}: ${name} loads from ${mfUrl} but ${uiName} is served on port ${ports.ui[uiName].port}. Change it on the module admin page or in ${fileName}.`,
      );
    }
  }
}
