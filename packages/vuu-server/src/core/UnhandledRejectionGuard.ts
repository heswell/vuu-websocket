import { getLogger } from "@heswell/service-utils/browser";

const log = getLogger("vuu.core");

let listener: ((reason: unknown) => void) | undefined;

/**
 * Last-resort guard: logs an unhandled promise rejection at error instead of
 * letting it terminate the process. Request handling already catches its
 * errors, so a rejection reaching this guard is a bug and is logged as such.
 * Installed once per process; returns a function that removes it.
 */
export function installUnhandledRejectionGuard(): () => void {
  if (listener === undefined) {
    const guard = (reason: unknown) => {
      log.error(
        "unhandled promise rejection (vuu.server.unhandledRejectionGuard kept the server running)",
        reason,
      );
    };
    listener = guard;
    process.on("unhandledRejection", guard);
  }
  return uninstallUnhandledRejectionGuard;
}

export function uninstallUnhandledRejectionGuard() {
  if (listener !== undefined) {
    process.off("unhandledRejection", listener);
    listener = undefined;
  }
}

export const isUnhandledRejectionGuardInstalled = () => listener !== undefined;
