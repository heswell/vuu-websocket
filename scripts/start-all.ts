import { Subprocess } from "bun";

let procRefData: Subprocess | null = null;
let procVuuServer: Subprocess | null = null;

procRefData = Bun.spawn(["bun", "./scripts/start-refdata.ts"], {
  stdout: "inherit",
});

setTimeout(() => {
  console.log(`spawn a process for the Vuu Server`);
  procVuuServer = Bun.spawn(["bun", "./scripts/start-demo.ts"], {
    stdout: "inherit",
  });
  console.log(`PID (demo vuu server) ${procVuuServer.pid}`);
}, 1000);

console.log(`PID (ref data) ${procRefData?.pid}`);

process.on("SIGINT", () => {
  procVuuServer?.kill();
  procRefData?.kill();
  process.exit();
});
