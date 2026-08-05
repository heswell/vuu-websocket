import "./server-runtime";

const { default: start } = await import("@heswell/vuu-module-discovery");
await start();
