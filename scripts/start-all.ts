import type { Subprocess } from "bun";

// Services reconnect to their dependencies, so they can be started in any
// order, no need to wait for one to be ready before starting the next.
// Each service loads its own application.conf by path. The demo server finds
// its config through VUU_APP, so set it unless the caller already has.
const scripts: Record<string, { script: string; env?: Record<string, string> }> =
  {
    "ref data": { script: "./scripts/start-refdata.ts" },
    equities: { script: "./scripts/start-equities.ts" },
    prices: { script: "./scripts/start-prices.ts" },
    // orders module is not currently enabled in the demo server
    // orders: { script: "./scripts/start-orders.ts" },
    "demo vuu server": {
      script: "./scripts/start-demo.ts",
      env: { VUU_APP: process.env.VUU_APP ?? "vuu-demo" },
    },
  };

const processes: Subprocess[] = [];

for (const [name, { script, env }] of Object.entries(scripts)) {
  const proc = Bun.spawn(["bun", script], {
    env: { ...process.env, ...env },
    stdout: "inherit",
    stderr: "inherit",
  });
  processes.push(proc);
  console.log(`PID (${name}) ${proc.pid}`);
}

process.on("SIGINT", () => {
  for (const proc of processes) {
    proc.kill();
  }
  process.exit();
});
