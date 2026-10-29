import type { Subprocess } from "bun";

// Starts every portal-related server. Services reconnect to their
// dependencies, so start order doesn't matter.
const servers: { name: string; script: string; env?: Record<string, string> }[] =
  [
    {
      name: "portal",
      script: "./scripts/start-portal.ts",
      env: {
        VUU_APP: "vuu-portal",
        VUU_WEBSOCKET_PORT: "9090",
        VUU_HTTPS_PORT: "9443",
      },
    },
    {
      name: "user admin",
      script: "./scripts/start-user-admin.ts",
      env: { VUU_APP: "vuu-user-admin" },
    },
    {
      name: "basket trading",
      script: "./scripts/start-basket-trading.ts",
      env: { VUU_APP: "vuu-basket-trading" },
    },
    { name: "equities", script: "./scripts/start-equities.ts" },
  ];

// How long children get to shut down before being force-killed.
const SHUTDOWN_TIMEOUT_MS = 5000;

const processes = new Map<Subprocess, string>();

for (const { name, script, env } of servers) {
  const proc = Bun.spawn(["bun", script], {
    env: { ...process.env, ...env },
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  processes.set(proc, name);
  console.log(`PID (${name}) ${proc.pid}`);
}

let shuttingDown = false;

const shutdown = async (signal: NodeJS.Signals) => {
  if (shuttingDown) {
    // Second CTRL-C: stop waiting and kill everything immediately.
    for (const proc of processes.keys()) proc.kill("SIGKILL");
    process.exit(1);
  }
  shuttingDown = true;
  console.log(`\n${signal} received, stopping portal servers...`);

  for (const proc of processes.keys()) {
    if (proc.exitCode === null && proc.signalCode === null) {
      proc.kill(signal);
    }
  }

  const timeout = setTimeout(() => {
    for (const [proc, name] of processes) {
      if (proc.exitCode === null && proc.signalCode === null) {
        console.log(`${name} (${proc.pid}) did not exit, killing`);
        proc.kill("SIGKILL");
      }
    }
  }, SHUTDOWN_TIMEOUT_MS);

  await Promise.all([...processes.keys()].map((proc) => proc.exited));
  clearTimeout(timeout);
  console.log("All portal servers stopped");
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

for (const [proc, name] of processes) {
  proc.exited.then((code) => {
    if (!shuttingDown) {
      console.log(`${name} (${proc.pid}) exited with code ${code}`);
    }
  });
}
