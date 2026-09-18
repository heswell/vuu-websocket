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

Each top-level record contains module-federation metadata. A remote that owns
its own VUU target includes a VUU connection:

```ts
type ModuleRecord = {
  id: number;
  name: string;
  title: string;
  description: string;
  version: number;
  enabled: boolean;
  location: string;
  path: string;
  mfComponent: string;
  mfScope: string;
  mfUrl: string;
  vuu?: {
    connectionId: string;
    restUrl?: string;
    websocketUrl?: string;
  };
  nestedModules?: NestedModuleRecord[];
};

type NestedModuleRecord = {
  name: string;
  mfComponent: string;
  mfScope: string;
  mfUrl: string;
};
```

Only enabled records permitted by the authenticated user's roles are returned.
For duplicate names, the highest version wins, followed by the highest id.

A module with a non-zero parent module id is returned only through its
authorized parent record's `nestedModules` array. Nested records contain
federation metadata only and never create portal routes or VUU connections.
