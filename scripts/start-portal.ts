import "./server-runtime";

const { default: start } = await import("@heswell/vuu-portal");
await start();
