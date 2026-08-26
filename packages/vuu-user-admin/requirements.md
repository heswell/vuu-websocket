# VUU user administration server

`@heswell/vuu-user-admin` is an independent VUU server for Keycloak
administration.

- HTTPS defaults to `8444`; WebSocket defaults to `8092`.
- `/api/authn` authenticates with the `vuu-user-admin-server` Keycloak client.
- The server registers only the `KEYCLOAK_ADMIN` feature module.
- User, group, role, group-role, and user-group-role providers load from the
  Keycloak Admin API.
- Edit RPCs update Keycloak and refresh all admin tables.
- The refresh coordinator periodically reconciles tables so multiple server
  instances converge.

The portal registry routes `userAdmin` to this server with connection id
`user-admin`. This server returns the generic `LOGIN_SUCCESS` shape and does not
include a portal module registry.
