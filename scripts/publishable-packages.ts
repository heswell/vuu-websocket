export const PUBLISHABLE_PACKAGES = [
  {
    name: "@heswell/user-admin",
    directory: "user-admin",
  },
  {
    name: "@heswell/module-admin",
    directory: "module-admin",
  },
] as const;

export type PublishablePackageName = (typeof PUBLISHABLE_PACKAGES)[number]["name"];

export const DEFAULT_PUBLISHABLE_PACKAGE_NAME = PUBLISHABLE_PACKAGES[0].name;

export const getPublishablePackage = (packageName: string) =>
  PUBLISHABLE_PACKAGES.find((candidate) => candidate.name === packageName);
