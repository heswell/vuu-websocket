// Under vitest these tests ran in happy-dom; bun test has no DOM, so provide
// the few browser globals the engine and @vuu-ui/vuu-data-test rely on.
const g = globalThis as Record<string, unknown>;

if (typeof g.requestAnimationFrame !== "function") {
  g.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number;
  g.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

if (typeof g.window === "undefined") {
  g.window = globalThis;
}
