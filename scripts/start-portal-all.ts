/**
 * Starts the portal backend servers and serves the built portal UI from
 * vuu-ui, all on the ports in portal.ports.json. CTRL-C stops everything.
 *
 *   npm run start:portal:all            backend and UI
 *   npm run start:portal:all -- --no-ui backend only
 */
import net from "node:net";
import path from "node:path";
import type { Subprocess } from "bun";
import {
  hostModule,
  loadPortalPorts,
  portsFilePath,
  prepareUi,
  type UiPlan,
} from "./portal-ports";

type BackendServer = {
  script: string;
  /** Vuu server app (packages/<app>/application.conf). Unset for plain services. */
  app?: string;
};

// The backend servers this launcher knows how to start. Their ports come
// from portal.ports.json; services reconnect to their dependencies, so start
// order doesn't matter.
const BACKEND: Record<string, BackendServer> = {
  portal: { script: "./scripts/start-portal.ts", app: "vuu-portal" },
  "user-admin": { script: "./scripts/start-user-admin.ts", app: "vuu-user-admin" },
  "basket-trading": {
    script: "./scripts/start-basket-trading.ts",
    app: "vuu-basket-trading",
  },
  equities: { script: "./scripts/start-equities.ts" },
};

// How long children get to shut down before being force-killed. Longer than
// portal-serve's own 5s wait for its static servers.
const SHUTDOWN_TIMEOUT_MS = 10000;
// Output lines not worth passing on.
const HIDDEN_LINES = [/Use npm run portal:stop to stop them/];
// Print the table anyway if something hasn't reported its URL by then.
const STARTUP_TIMEOUT_MS = 30000;

const noUi = process.argv.includes("--no-ui");
const ports = loadPortalPorts(Object.keys(BACKEND));

type Child = {
  name: string;
  proc: Subprocess<"ignore", "pipe", "pipe">;
  stopSignal?: NodeJS.Signals;
  exitCode?: number | null;
};

type Row = {
  child: Child;
  name: string;
  /** Number of URLs the row expects before it counts as started. */
  expected: number;
  websocket?: string;
  rest?: string;
  url?: string;
  backend?: string;
};

const children: Child[] = [];
const backendRows: Row[] = [];
const uiRows: Row[] = [];
let shuttingDown = false;
let tablePrinted = false;

const ANSI = /\x1b\[[0-9;]*m/g;
const LISTENING = /listening on ((?:wss?|https?):\/\/\S+)/;
const UI_READY = /^(\S+) ready at (https?:\/\/\S+)/;

const isAlive = (proc: Subprocess) =>
  proc.exitCode === null && proc.signalCode === null;

const urlCount = (row: Row) =>
  [row.websocket, row.rest, row.url].filter(Boolean).length;

const isSettled = (row: Row) =>
  row.child.exitCode !== undefined || urlCount(row) >= row.expected;

const status = (row: Row) =>
  urlCount(row) >= row.expected
    ? row.child.exitCode !== undefined
      ? "stopped"
      : "running"
    : row.child.exitCode !== undefined
      ? `exited (${row.child.exitCode})`
      : "starting?";

const table = (header: string[], rows: string[][]) => {
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i].length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, i) => cell.padEnd(widths[i]))
      .join("  ")
      .trimEnd();
  return [line(header), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)];
};

const printSummary = (plan: UiPlan | undefined) => {
  if (tablePrinted || shuttingDown) return;
  tablePrinted = true;
  clearTimeout(startupTimer);

  const lines = [
    "",
    ...table(
      ["Server", "Status", "WebSocket", "REST"],
      backendRows.map((row) => [
        row.name,
        status(row),
        row.websocket ?? "-",
        row.rest ?? "-",
      ]),
    ),
  ];
  if (uiRows.length > 0) {
    lines.push(
      "",
      ...table(
        ["UI module", "Status", "URL", "Backend"],
        uiRows.map((row) => [
          row.name,
          status(row),
          row.url ?? "-",
          row.backend ?? "-",
        ]),
      ),
    );
  }
  const warnings = plan?.warnings ?? [];
  if (warnings.length > 0) {
    lines.push("", "Warnings:", ...warnings.map((warning) => `  - ${warning}`));
  }
  console.log([...lines, ""].join("\n"));
};

const checkAllStarted = () => {
  const rows = [...backendRows, ...uiRows];
  if (rows.length > 0 && rows.every(isSettled)) printSummary(uiPlan);
};

// Copies a child's output to ours line by line, passing each line to onLine
// to pick out the URLs it reports.
const pump = async (
  stream: ReadableStream<Uint8Array>,
  out: NodeJS.WriteStream,
  onLine: (line: string) => void,
) => {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let pending = "";
  const emit = (line: string) => {
    const text = line.replace(ANSI, "");
    if (HIDDEN_LINES.some((hidden) => hidden.test(text))) return;
    out.write(`${line}\n`);
    onLine(text);
  };
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    lines.forEach(emit);
  }
  if (pending) emit(pending);
};

const spawn = (
  name: string,
  cmd: string[],
  options: { cwd?: string; env?: Record<string, string>; stopSignal?: NodeJS.Signals },
  onLine: (line: string) => void,
) => {
  const proc = Bun.spawn(cmd, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const child: Child = { name, proc, stopSignal: options.stopSignal };
  children.push(child);
  console.log(`PID (${name}) ${proc.pid}`);

  const handleLine = (line: string) => {
    onLine(line);
    checkAllStarted();
  };
  pump(proc.stdout, process.stdout, handleLine);
  pump(proc.stderr, process.stderr, handleLine);

  proc.exited.then((code) => {
    child.exitCode = code;
    if (!shuttingDown) {
      console.log(`${name} (${proc.pid}) exited with code ${code}`);
      checkAllStarted();
    }
  });
  return child;
};

const startupTimer = setTimeout(() => printSummary(uiPlan), STARTUP_TIMEOUT_MS);

// UI first: it rewrites the built config.json files before anything loads them.
const uiPlan = noUi ? undefined : prepareUi(ports);
const relativePortsFile = path.relative(process.cwd(), portsFilePath);
console.log(
  `Ports from ${relativePortsFile.startsWith("..") ? portsFilePath : relativePortsFile}`,
);
for (const name of uiPlan?.updated ?? []) {
  console.log(`[portal ports] ${name}/config.json now points at ${ports.ui[name].backend}`);
}

// Vuu servers accept auth requests from the portal host page only.
const hostPort = ports.ui[hostModule(ports)].port;
const corsOrigins = `http://localhost:${hostPort},http://127.0.0.1:${hostPort}`;

for (const [name, server] of Object.entries(BACKEND)) {
  const { websocket, https } = ports.backend[name];
  const env: Record<string, string> = server.app
    ? {
        VUU_APP: server.app,
        VUU_WEBSOCKET_PORT: String(websocket),
        ...(https !== undefined && { VUU_HTTPS_PORT: String(https) }),
        // An origin list set in the shell wins.
        ...(!process.env.VUU_CORS_ALLOWED_ORIGINS &&
          !process.env.VUU_CORS_ALLOWED_ORIGIN && {
            VUU_CORS_ALLOWED_ORIGINS: corsOrigins,
          }),
      }
    : { VUU_SERVICE_PORT: String(websocket) };

  const row = { name, expected: https === undefined ? 1 : 2 } as Row;
  row.child = spawn(name, ["bun", server.script], { env }, (line) => {
    const url = line.match(LISTENING)?.[1];
    if (!url) return;
    if (url.startsWith("ws")) row.websocket ??= url;
    else row.rest ??= url;
  });
  backendRows.push(row);
}

const isPortInUse = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });

// Something else (nginx, say) may already serve dist_portal. It serves the
// updated config.json files as they are, so leave it be.
const takenUiPorts = [];
for (const name of uiPlan?.served ?? []) {
  if (await isPortInUse(ports.ui[name].port)) {
    takenUiPorts.push(`${name} (${ports.ui[name].port})`);
  }
}
if (uiPlan?.serveConfigPath && takenUiPorts.length > 0) {
  uiPlan.warnings.push(
    `UI not started: ports already in use for ${takenUiPorts.join(", ")}. If another server (e.g. nginx) serves dist_portal, it picks up the updated config.json on the next page load.`,
  );
  uiPlan.serveConfigPath = undefined;
}

if (uiPlan?.serveConfigPath) {
  const vuuUi = ports.vuuUiDir;
  const child = spawn(
    "ui",
    [
      "node",
      path.join(vuuUi, "tools/portal-build-tool/dist/serve-cli.js"),
      "start",
      "--config",
      uiPlan.serveConfigPath,
    ],
    {
      cwd: vuuUi,
      // portal-serve runs the `serve` package from vuu-ui's node_modules.
      env: { PATH: `${path.join(vuuUi, "node_modules/.bin")}:${process.env.PATH}` },
      // CTRL-C already sends it SIGINT; SIGTERM avoids a second SIGINT
      // killing it before it has stopped its own servers.
      stopSignal: "SIGTERM",
    },
    (line) => {
      const [, name, url] = line.match(UI_READY) ?? [];
      const row = uiRows.find((uiRow) => uiRow.name === name);
      if (row) row.url ??= url;
    },
  );
  for (const name of uiPlan.served) {
    uiRows.push({ child, name, expected: 1, backend: ports.ui[name].backend });
  }
}

const shutdown = async (signal: NodeJS.Signals) => {
  if (shuttingDown) {
    // Second CTRL-C: stop waiting and kill everything immediately.
    for (const { proc } of children) proc.kill("SIGKILL");
    process.exit(1);
  }
  shuttingDown = true;
  clearTimeout(startupTimer);
  console.log(`\n${signal} received, stopping portal servers...`);

  for (const { proc, stopSignal } of children) {
    if (isAlive(proc)) proc.kill(stopSignal ?? signal);
  }

  const timeout = setTimeout(() => {
    for (const { name, proc } of children) {
      if (isAlive(proc)) {
        console.log(`${name} (${proc.pid}) did not exit, killing`);
        proc.kill("SIGKILL");
      }
    }
  }, SHUTDOWN_TIMEOUT_MS);

  await Promise.all(children.map(({ proc }) => proc.exited));
  clearTimeout(timeout);
  console.log("All portal servers stopped");
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
