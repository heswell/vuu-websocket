// ConfigFactory finds the demo's application.conf through VUU_APP. Default it
// here so the script can be run directly, e.g.
//   VUU_WEBSOCKET_PORT=8090 bun ./scripts/start-demo.ts
// The import is dynamic so the default is set before any config is loaded.
process.env.VUU_APP ??= "vuu-demo";

const { default: start } = await import("@heswell/vuu-demo");
await start();
