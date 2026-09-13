# VUU user administration server

`@heswell/vuu-user-admin` is an independent VUU server for Keycloak
administration.

- HTTPS defaults to `8444`; WebSocket defaults to
  `wss://localhost:8092/websocket-user-admin`.
- `/api/authn` authenticates with the `vuu-user-admin` Keycloak client.
- The server registers only the `KEYCLOAK_ADMIN` feature module.
- User, group, client, unified-role, user-group, group-role, and compatibility
  user-group-role providers load complete snapshots from the
  Keycloak Admin API. Collection reads follow Keycloak's `first`/`max`
  pagination contract; the old seeded-user/group lists are no longer used.
- Keycloak's nested group tree is recursively flattened into the `groups` read
  model, but the `groups` table currently exposes only leaf groups. Each row
  retains its Keycloak group ID, full path, and parent group ID, so a group such
  as `/vuu/basket-trading/users` is independently addressable without exposing
  a separate `group_name` column. The full hierarchy remains in the snapshot for
  relationship reads and future nested-group views.
- Client and client-role reads are limited to client identifiers beginning
  with `vuu-`. Client creation, client-role creation/editing, and client-role
  group assignment/removal reject other client identifiers; realm roles remain
  available to mutation APIs but are not loaded into the `roles`,
  `group_roles`, or `user_group_roles` read models.
- Providers share one snapshot read during startup and one fresh snapshot after
  every mutation. The refresh coordinator reconciles every admin table so
  multiple server instances converge.
- The `users` table includes server-derived `module_access` and
  `module_access_count` fields. They contain sorted, deduplicated portal module
  access role names assigned through the user's groups for the `vuu-portal`
  client only. Only current `*-access` role names are included; direct
  user-role assumptions, realm roles, and non-VUU clients are excluded. The UI
  maps these role names to its module descriptors.
- Identity tables use the standard Vuu `vuuCreatedTimestamp` and
  `vuuUpdatedTimestamp` audit columns for row timestamps; `users`, `groups`,
  and `roles` do not expose a separate `created_at` column.
- Supported add, edit, delete, and relationship-assignment RPCs validate their
  inputs, call Keycloak directly, and then refresh the snapshot. VUU edit
  sessions are not used as a persistence mechanism.
- The UI RPC contract is exported from `KeycloakAdminContract.ts`. Supported
  RPC names are `addUser`, `updateUser`, `deleteUser`, `addGroup`,
  `updateGroup`, `deleteGroup`, `addClient`, `updateClient`, `addRole`,
  `addClientRole`, `updateRole`, `assignGroupRole`, `removeGroupRole`,
  `assignUserToGroup`, and `removeUserFromGroup`. Legacy aliases
  (`addRoleToGroup`, `assignRoleToGroup`, `removeRoleFromGroup`, and
  `addUserToGroup`) remain registered.
- `addUser` and `updateUser` validate `temporary_password` as a non-empty
  write-only string and `group_ids` as a string array. `updateUser` replaces
  group membership with that array; role assignment/removal accepts
  `groupId`/`groupName`, `roleId`/`roleName`, and optional `clientId` (omit
  `clientId` for realm roles).
- Unsupported mutations are client/role deletion, direct user-role assignment,
  client-secret rotation, password reads, arbitrary Keycloak attributes, and
  group hierarchy/parent changes.
- The primary VUU tables are `users`, `groups`, `clients`, `roles`,
  `user_groups`, and `group_roles`. The `user_group_roles` table remains as a
  flattened compatibility projection. The `roles` table contains only client
  roles from `vuu-*` clients.
- Exact logical columns are declared in `KEYCLOAK_ADMIN_TABLE_CONTRACT` and
  mirror the table definitions: user identity/count and login fields, leaf
  group path/parent/count fields, unified role/client identity and counts, client
  identity fields, and membership/assignment identity fields. Keycloak
  omissions use empty strings or `0` for timestamps/counts.

The portal registry routes `userAdmin` to this server with connection id
`user-admin`. This server returns the generic `LOGIN_SUCCESS` shape and does not
include a portal module registry.
