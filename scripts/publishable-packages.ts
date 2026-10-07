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
    name: "@vuu-ui/vuu-data-engine-local",
    directory: "vuu-data-engine-local",
  },
] as const;

export type PublishablePackageName = (typeof PUBLISHABLE_PACKAGES)[number]["name"];

export const DEFAULT_PUBLISHABLE_PACKAGE_NAME = PUBLISHABLE_PACKAGES[0].name;

export const getPublishablePackage = (packageName: string) =>
  PUBLISHABLE_PACKAGES.find((candidate) => candidate.name === packageName);

export const PUBLISHABLE_PACKAGE_NAMES_TEXT = PUBLISHABLE_PACKAGES.map(
  ({ name }) => name,
).join(", ");
