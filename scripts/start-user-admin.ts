import "./server-runtime";

const { default: start } = await import("@heswell/vuu-user-admin");
await start();
