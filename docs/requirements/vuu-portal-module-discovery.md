# Requirement: portal module discovery

The portal server owns remote-module discovery. It registers a
`MODULE_DISCOVERY` VUU module with editable `modules` and `modulePermissions`
tables and derives a user-specific registry during WebSocket login.

The registry is serialized only on portal `LOGIN_SUCCESS` messages:

```ts
type LoginSuccess = {
  type: "LOGIN_SUCCESS";
  vuuServerId: string;
  moduleRegistry?: { modules: ModuleRecord[] };
};
```

Other VUU servers omit `moduleRegistry`. The former authenticated
`GET /module-registry` browser endpoint does not exist.

Each record contains module-federation metadata and matches the UI's
`VuuModuleDescriptor` (`@vuu-ui/vuu-protocol-types`). Records carry no VUU
connection details; clients discover a module's VUU connection through a
separate mechanism:

```ts
type ModuleRecord = {
  clientIdentifier: string;
  accessRole: string;
  id: number;
  name: string;
  title: string;
  description: string;
  version: number;
  enabled: boolean;
  navLocation: string;
  navIconName?: string;
  navIconUrl?: string;
  path: string;
  mfComponent: string;
  mfScope: string;
  mfUrl: string;
};
```

Only enabled records permitted by the authenticated user's roles are returned.
For duplicate names, the highest version wins, followed by the highest id.

`navLocation` is the module table's `location` column. `navIconUrl` (an SVG
data URL) comes from the optional `navIconUrl` column and is omitted when
empty. `mfScope` must equal the remote's module-federation name (for example
`userAdmin`), or the UI cannot load it. `accessRole` is the
role that granted access. `clientIdentifier` is the module's own client,
derived from its name (`userAdmin` -> `vuu-user-admin`; names that already
start with `vuu-` are unchanged). The UI keys each module's saved state by it.

A module with a non-zero parent module id is a nested module. It is listed
alongside the other records with an empty `navLocation`, so it has no
navigation entry and is rendered from within another module. It is returned
only when both it and its parent are authorized.
