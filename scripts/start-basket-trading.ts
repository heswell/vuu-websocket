import "./server-runtime";

const { default: start } = await import("@heswell/vuu-basket-trading");
await start();
