# VUU portal server

`@heswell/vuu-portal` is the browser-facing VUU server for the portal host.

## Runtime contract

- HTTPS defaults to `8443`; WebSocket defaults to `8091`.
- `/api/authn` authenticates browser users.
- `LOGIN_SUCCESS` includes `moduleRegistry: { modules: ModuleRecord[] }`.
- No browser-facing `/module-registry` HTTP endpoint is installed.
- The server registers `MODULE_DISCOVERY`, including editable `modules` and
  `modulePermissions` tables.
- Registry selection includes only enabled, role-permitted modules and chooses
  the highest version, then highest id, for each module name.

The built-in records route:

- `moduleAdmin` to the current portal connection (`connectionId: "portal"`);
- `userAdmin` to the standalone user-admin server (`connectionId:
  "user-admin"`, HTTPS `8444`, WebSocket `8092`); and
- basket trading to its existing independent server.

Keycloak mode uses the `vuu-portal-server` client. Local permissive mode remains
available through `vuu.auth.mode=permissive`.
