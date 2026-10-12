export const PUBLISHABLE_PACKAGES = [
  {
    name: "@heswell/user-admin",
    directory: "user-admin",
  },
  {
    name: "@heswell/module-admin",
    directory: "module-admin",
  },
  // vuu-table must precede vuu-viewport, which depends on it.
  {
    name: "@heswell/vuu-table",
    directory: "vuu-table",
  },
  {
    name: "@heswell/vuu-viewport",
    directory: "vuu-viewport",
  },
  // Depends on all of the above.
  {
    name: "@heswell/vuu-data-engine-local",
    directory: "vuu-data-engine-local",
  },
  // Server packages, in dependency order. service-utils depends on
  // vuu-table; vuu-server on service-utils, vuu-table and vuu-viewport;
  // vuu-portal on vuu-server and module-admin.
  {
    name: "@heswell/service-utils",
    directory: "service-utils",
  },
  {
    name: "@heswell/vuu-server",
    directory: "vuu-server",
  },
  {
    name: "@heswell/vuu-portal",
    directory: "vuu-portal",
  },
] as const;

export type PublishablePackageName = (typeof PUBLISHABLE_PACKAGES)[number]["name"];

export const DEFAULT_PUBLISHABLE_PACKAGE_NAME = PUBLISHABLE_PACKAGES[0].name;

export const getPublishablePackage = (packageName: string) =>
  PUBLISHABLE_PACKAGES.find((candidate) => candidate.name === packageName);

export const PUBLISHABLE_PACKAGE_NAMES_TEXT = PUBLISHABLE_PACKAGES.map(
  ({ name }) => name,
).join(", ");
