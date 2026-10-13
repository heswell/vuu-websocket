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

// Keeps the range operator (^, ~) of an existing dependency so published
// packages do not pin their siblings. A peer range that already admits the new
// version (including a compound range such as "^3.1.0 || ^4.0.0") is left
// alone, so dependents need no republish for a compatible bump. A compound
// range that does not admit the new version is replaced with a caret range.
export const nextDependencyRange = (
  current: string,
  version: string,
  section: string,
) => {
  if (section === "peerDependencies" && Bun.semver.satisfies(version, current)) {
    return current;
  }
  const simple = /^([\^~]?)\d[^\s|]*$/.exec(current.trim());
  return simple ? `${simple[1]}${version}` : `^${version}`;
};
