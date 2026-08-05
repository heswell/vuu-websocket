if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class implements ResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
}
