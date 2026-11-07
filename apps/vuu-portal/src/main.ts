import { loadServerRuntime } from "@heswell/vuu-server";
import {
  createPortalApplication,
  type PortalApplicationOptions,
} from "./PortalApplication";

/**
 * Creates and starts the portal application from application.conf (see
 * createPortalApplication). Importing this module has no side effects; use
 * the `vuu-portal` bin to start the portal from a shell. Runs on Bun, or on
 * Node.js when @heswell/vuu-server-node is installed (or a runtime is passed).
 */
export async function main(options: PortalApplicationOptions = {}) {
  const runtime = options.runtime ?? (await loadServerRuntime());
  const application = createPortalApplication({ ...options, runtime });
  await application.start();
  return application;
}

export default main;
