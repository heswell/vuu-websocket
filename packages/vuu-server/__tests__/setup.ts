import { mkdirSync } from "node:fs";

mkdirSync("logs", { recursive: true });

class TestResizeObserver implements ResizeObserver {
  disconnect() {}

  observe() {}

  unobserve() {}
}

globalThis.ResizeObserver = TestResizeObserver;
