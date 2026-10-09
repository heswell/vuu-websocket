import type { Subprocess } from "bun";

// Services reconnect to their dependencies, so they can be started in any
// order, no need to wait for one to be ready before starting the next.
const scripts = {
  "ref data": "./scripts/start-refdata.ts",
  equities: "./scripts/start-equities.ts",
  prices: "./scripts/start-prices.ts",
  // orders module is not currently enabled in the demo server
  // orders: "./scripts/start-orders.ts",
  "demo vuu server": "./scripts/start-demo.ts",
};

const processes: Subprocess[] = [];

for (const [name, script] of Object.entries(scripts)) {
  const proc = Bun.spawn(["bun", script], {
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
