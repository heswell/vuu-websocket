// Runtime agnostic: requestAnimationFrame is a browser global and is not
// available when the engine is hosted in plain Node/Bun (trader upstream
// issue 78). Fall back to a macrotask, which, like rAF, runs after the
// current task and any queued microtasks.
export const nextFrame = (callback: () => void): void => {
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => callback());
  } else {
    globalThis.setTimeout(callback, 0);
  }
};
