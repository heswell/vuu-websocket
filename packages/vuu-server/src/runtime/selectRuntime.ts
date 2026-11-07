import { bunRuntime } from "./bunRuntime";
import type { ServerRuntime } from "./ServerRuntime";

export const NODE_RUNTIME_PACKAGE = "@heswell/vuu-server-node";

// Kept on globalThis so two copies of this package still share one setting.
const REGISTERED = Symbol.for("@heswell/vuu-server/runtime");
type RuntimeHolder = { [REGISTERED]?: ServerRuntime };

const isBun = () => typeof Bun !== "undefined";

const isNotInstalled = (error: unknown) => {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  return (
    (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") &&
    String(message).includes(NODE_RUNTIME_PACKAGE)
  );
};

/**
 * Sets the runtime used when none is passed explicitly. Bun is used by
 * default, so this is only needed for another runtime, e.g.
 * `setServerRuntime(nodeRuntime)` from @heswell/vuu-server-node.
 */
export function setServerRuntime(runtime: ServerRuntime | undefined) {
  (globalThis as RuntimeHolder)[REGISTERED] = runtime;
}

const noRuntimeError = () =>
  new Error(
    `No server runtime: not running under Bun and none set. Run with Bun, or install ${NODE_RUNTIME_PACKAGE} and pass its nodeRuntime (or call setServerRuntime).`,
  );

/** The runtime set with setServerRuntime, else Bun when running under Bun. */
export function getServerRuntime(): ServerRuntime {
  const registered = (globalThis as RuntimeHolder)[REGISTERED];
  if (registered) return registered;
  if (isBun()) return bunRuntime;
  throw noRuntimeError();
}

/**
 * As getServerRuntime, but outside Bun, with no runtime set, it loads
 * @heswell/vuu-server-node if it is installed, and sets it.
 */
export async function loadServerRuntime(): Promise<ServerRuntime> {
  const registered = (globalThis as RuntimeHolder)[REGISTERED];
  if (registered || isBun()) return getServerRuntime();
  let runtime: ServerRuntime | undefined;
  try {
    const module = (await import(
      /* webpackIgnore: true */ NODE_RUNTIME_PACKAGE
    )) as { nodeRuntime?: ServerRuntime };
    runtime = module.nodeRuntime;
  } catch (error) {
    if (!isNotInstalled(error)) throw error;
  }
  if (!runtime) throw noRuntimeError();
  setServerRuntime(runtime);
  return runtime;
}
