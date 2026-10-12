import {
  createPortalApplication,
  type PortalApplicationOptions,
} from "./PortalApplication";

/**
 * Creates and starts the portal application. Importing this module has no
 * side effects; use the `vuu-portal` bin to start the portal from a shell.
 */
export async function main(options?: PortalApplicationOptions) {
  const application = createPortalApplication(options);
  await application.start();
  return application;
}

export default main;
