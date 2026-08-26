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

Each record contains module-federation metadata and a required VUU connection:

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
  vuu: {
    connectionId: string;
    restUrl?: string;
    websocketUrl?: string;
  };
};
```

Only enabled records permitted by the authenticated user's roles are returned.
For duplicate names, the highest version wins, followed by the highest id.
