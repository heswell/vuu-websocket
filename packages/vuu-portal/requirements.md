# VUU portal server

`@heswell/vuu-portal` is the browser-facing VUU server for the portal host.

## Runtime contract

- HTTPS defaults to `8443`; WebSocket defaults to
  `wss://localhost:8091/websocket-portal`.
- `POST /api/authn` validates portal navigation tokens and authorizes only from
  `resource_access.vuu-portal.roles`.
- `POST /api/authn/module-admin` always exchanges into the fixed
  `vuu-module-admin-server` client and issues a separate VUU login token.
- `LOGIN_SUCCESS` includes `moduleRegistry: { modules: ModuleRecord[] }`.
- No browser-facing `/module-registry` HTTP endpoint is installed.
- The server registers `MODULE_DISCOVERY`, including editable `modules` and
  `modulePermissions` tables. Module definitions are loaded from
  `vuu.portal.modulesFile` (default `modules.yaml`) and persisted after every
  successful module-admin mutation. If the file is missing, it is seeded from
  the built-in catalog plus `module-access.yaml`; `module-access.yaml` is
  seed-only after that.
- Registry selection includes only enabled, role-permitted modules and chooses
  the highest version, then highest id, for each module name. Child modules
  without their own permission row inherit their parent module role and are only
  exposed when the parent is permitted.


Module administration RPCs are viewport RPCs available on both discovery
tables: `createModule`, `updateModule`, `setModuleEnabled`, and `deleteModule`.
Structured config payloads are JSON strings matching
`@heswell/module-admin/contracts`; mutations are version-checked where relevant
and update the `modules` and `modulePermissions` tables plus `modules.yaml`.

Module records do not carry VUU connection details (connection id, WebSocket
or REST URLs); clients discover those through a separate mechanism. Legacy
`vuuConnectionId`, `vuuWebsocketUrl` and `vuuRestUrl` fields in an existing
`modules.yaml` are ignored on load and dropped on the next save.

Keycloak mode uses `vuu-portal-server` to validate navigation tokens and
`vuu-module-admin-server` for the fixed module-admin profile. Local permissive
mode remains available through `vuu.auth.mode=permissive`.

Keycloak bootstrap disables full scope for the public portal client. Portal
tokens retain all four confidential server audiences for standard exchange but
contain only the three portal-owned navigation roles; remote resource roles
appear only after exchange into the owning confidential client.
