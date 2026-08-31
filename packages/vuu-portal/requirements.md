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
  `modulePermissions` tables.
- Registry selection includes only enabled, role-permitted modules and chooses
  the highest version, then highest id, for each module name.

The built-in records route:

- `moduleAdmin` to `connectionId: "module-admin"` through
  `https://localhost:8443/api/authn/module-admin` and the portal WebSocket
  `wss://localhost:8091/websocket-portal`;
- `userAdmin` to the standalone user-admin server (`connectionId:
  "user-admin"`, HTTPS `8444`, WebSocket
  `wss://localhost:8092/websocket-user-admin`); and
- basket trading to its independent server at
  `wss://localhost:8093/websocket-basket-trading`.

Keycloak mode uses `vuu-portal-server` to validate navigation tokens and
`vuu-module-admin-server` for the fixed module-admin profile. Local permissive
mode remains available through `vuu.auth.mode=permissive`.

Keycloak bootstrap disables full scope for the public portal client. Portal
tokens retain all four confidential server audiences for standard exchange but
contain only the three portal-owned navigation roles; remote resource roles
appear only after exchange into the owning confidential client.
