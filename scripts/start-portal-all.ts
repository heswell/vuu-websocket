import type { Subprocess } from "bun";

type ServerConfig = {
  name: string;
  script: string;
  env?: Record<string, string>;
  // Number of "listening on <url>" lines the server logs once it is up.
  endpoints: number;
};

// Starts every portal-related server. Services reconnect to their
// dependencies, so start order doesn't matter.
const servers: ServerConfig[] = [
  {
    name: "portal",
    script: "./scripts/start-portal.ts",
    env: {
      VUU_APP: "vuu-portal",
      VUU_WEBSOCKET_PORT: "9090",
      VUU_HTTPS_PORT: "9443",
    },
    endpoints: 2,
  },
  {
    name: "user admin",
    script: "./scripts/start-user-admin.ts",
    env: { VUU_APP: "vuu-user-admin" },
    endpoints: 2,
  },
  {
    name: "basket trading",
    script: "./scripts/start-basket-trading.ts",
    env: { VUU_APP: "vuu-basket-trading" },
    endpoints: 2,
  },
  { name: "equities", script: "./scripts/start-equities.ts", endpoints: 1 },
];

// How long children get to shut down before being force-killed.
const SHUTDOWN_TIMEOUT_MS = 5000;
// Print the table anyway if some server hasn't reported its ports by then.
const STARTUP_TIMEOUT_MS = 30000;

type RunningServer = ServerConfig & {
  proc: Subprocess<"ignore", "pipe", "pipe">;
  websocket?: string;
  rest?: string;
  exitCode?: number | null;
};

const running: RunningServer[] = [];
let shuttingDown = false;
let tablePrinted = false;

const LISTENING = /listening on ((?:wss?|https?):\/\/\S+)/;
const ANSI = /\x1b\[[0-9;]*m/g;

const isAlive = (proc: Subprocess) =>
  proc.exitCode === null && proc.signalCode === null;

const isSettled = (server: RunningServer) =>
  server.exitCode !== undefined ||
  [server.websocket, server.rest].filter(Boolean).length >= server.endpoints;

const printTable = () => {
  if (tablePrinted || shuttingDown) return;
  tablePrinted = true;
  clearTimeout(startupTimer);

  const rows = running.map((server) => {
    const status =
      server.exitCode !== undefined
        ? `exited (${server.exitCode})`
        : isSettled(server)
          ? "running"
          : "starting?";
    return [server.name, status, server.websocket ?? "-", server.rest ?? "-"];
  });
  const header = ["Server", "Status", "WebSocket", "REST"];
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i].length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, i) => cell.padEnd(widths[i]))
      .join("  ")
      .trimEnd();

  console.log(
    [
      "",
      line(header),
      line(widths.map((w) => "-".repeat(w))),
      ...rows.map(line),
      "",
    ].join("\n"),
  );
};

const checkAllStarted = () => {
  if (running.length === servers.length && running.every(isSettled)) {
    printTable();
  }
};

// Copies a child's output to ours unchanged, while watching each line for
// the "listening on <url>" messages that tell us which ports it is using.
const pump = async (
  stream: ReadableStream<Uint8Array>,
  out: NodeJS.WriteStream,
  server: RunningServer,
) => {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let pending = "";
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    out.write(chunk);
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const text of lines) {
      const url = text.replace(ANSI, "").match(LISTENING)?.[1];
      if (!url) continue;
      if (url.startsWith("ws")) server.websocket ??= url;
      else server.rest ??= url;
      checkAllStarted();
    }
  }
};

const startupTimer = setTimeout(printTable, STARTUP_TIMEOUT_MS);

for (const config of servers) {
  const proc = Bun.spawn(["bun", config.script], {
    env: { ...process.env, ...config.env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const server: RunningServer = { ...config, proc };
  running.push(server);
  console.log(`PID (${config.name}) ${proc.pid}`);

  pump(proc.stdout, process.stdout, server);
  pump(proc.stderr, process.stderr, server);

  proc.exited.then((code) => {
    server.exitCode = code;
    if (!shuttingDown) {
      console.log(`${config.name} (${proc.pid}) exited with code ${code}`);
      checkAllStarted();
    }
  });
}

const shutdown = async (signal: NodeJS.Signals) => {
  if (shuttingDown) {
    // Second CTRL-C: stop waiting and kill everything immediately.
    for (const { proc } of running) proc.kill("SIGKILL");
    process.exit(1);
  }
  shuttingDown = true;
  clearTimeout(startupTimer);
  console.log(`\n${signal} received, stopping portal servers...`);

  for (const { proc } of running) {
    if (isAlive(proc)) proc.kill(signal);
  }

  const timeout = setTimeout(() => {
    for (const { name, proc } of running) {
      if (isAlive(proc)) {
        console.log(`${name} (${proc.pid}) did not exit, killing`);
        proc.kill("SIGKILL");
      }
    }
  }, SHUTDOWN_TIMEOUT_MS);

  await Promise.all(running.map(({ proc }) => proc.exited));
  clearTimeout(timeout);
  console.log("All portal servers stopped");
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
