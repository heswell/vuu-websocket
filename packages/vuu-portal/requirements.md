# VUU portal server

`@heswell/vuu-portal` is the browser-facing VUU server for the portal host.

## Runtime contract

- HTTPS defaults to `8443`; WebSocket defaults to `8091`.
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
  `wss://localhost:8091/websocket`;
- `userAdmin` to the standalone user-admin server (`connectionId:
  "user-admin"`, HTTPS `8444`, WebSocket `8092`); and
- basket trading to its existing independent server.

Keycloak mode uses `vuu-portal-server` to validate navigation tokens and
`vuu-module-admin-server` for the fixed module-admin profile. Local permissive
mode remains available through `vuu.auth.mode=permissive`.
