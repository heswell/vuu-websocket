# VUU Portal Requirements

## Purpose
Create a new package named vuu-portal that runs a VUU server similar to vuu-demo, but focused only on exposing Keycloak administration data to VUU clients.

The service must:
- start a VUU websocket server
- register exactly one VUU module named KEYCLOAK_ADMIN
- expose users, groups, roles, and one join table for user/group/role mappings
- load table data from Keycloak realm metadata

## Package Scope
- Package location: packages/vuu-portal
- Runtime: Bun + TypeScript + ESM
- Main entry: src/PortalMain.ts
- Module entry: src/index.ts (default export of PortalMain)
- Config file: application.conf in package root

## Implementation Placement Requirements
To preserve parity with original Scala VUU server patterns:
- REST service and auth implementation code must live only in either:
- packages/vuu-portal
- packages/vuu-server
- Do not place portal REST/auth implementation logic in unrelated packages.
- Prefer adding shared protocol/auth/server primitives in vuu-server when they are reusable across apps.
- Keep vuu-portal focused on app composition, module wiring, and portal-specific configuration.
- Naming, request/response shapes, and flow structure should follow existing vuu-server conventions and Scala VUU behavior as closely as possible.

## Dependencies
The package must depend on:
- @heswell/vuu-server
- pino

No additional Keycloak SDK is required; use Keycloak admin REST endpoints via fetch.

## Server Startup Behavior
- Build VuuServerConfig with:
1. websocket options derived from application.conf
2. LoginTokenService from vuu-server
3. exactly one module: KeycloakAdminModule
- Start lifecycle after server construction.
- Websocket URI should be websocket.
- Websocket port should default to 8090 unless overridden by existing server options/patterns.

## REST Support Requirements
The portal service must expose a lightweight HTTP REST surface alongside websocket support.

Required endpoints:
- POST /api/authn

Endpoint behavior:
- POST /api/authn accepts username/password and returns an auth token payload used by the portal client.
- Endpoint shape and behavior must maintain 100% compatibility with the Scala VUU server implementation.
- the token returned by /api/authn must be exactly the same format as Scala VUU server output.
- this token is the one the client must send to VUU server when establishing the websocket connection.

REST response requirements:
- return application/json for all success and error payloads
- include clear error message fields for failures
- use HTTP status codes consistently: 200, 400, 401, 403, 500
- include Access-Control-Allow-Origin for local web client usage

## Auth Support Requirements
Authentication and authorization must be explicit and configurable.

Authentication:
- support Keycloak-backed authentication as the default mode
- login flow must validate credentials against Keycloak and establish a portal session/token
- authenticated identity must include username and mapped authorizations
- when vuu.auth.mode=keycloak, POST /api/authn must return a Scala-compatible VUU auth token
- token semantics, field names, encoding, and parsing behavior must match Scala VUU exactly
- user role/authorization information may be included or resolved as required by Scala-compatible token semantics
- support an alternative permissive auth provider mode for local/dev compatibility that authenticates any user credentials
- permissive mode behavior must mirror Scala AuthenticatorFromUserList-style development flow: accept the supplied username and issue a valid portal auth response

Authorization:
- enforce authentication for websocket/session flows after successful /api/authn login
- role/authorization mapping must be consistent with Scala VUU auth semantics

Configuration for auth:
- vuu.auth.mode with values keycloak or permissive (default keycloak)
- vuu.auth.cors.allowedOrigin (default http://localhost:5002)
- KeycloakAdmin settings must be read from application.conf using the vuu.keycloak prefix:
- vuu.keycloak.url (default http://localhost:8080)
- vuu.keycloak.realm (default vuu)
- vuu.keycloak.adminRealm (default master)
- vuu.keycloak.adminUsername (default admin)
- vuu.keycloak.adminPassword (default admin)
- vuu.keycloak.clientId (default admin-cli)
- vuu.keycloak.clientSecret (optional for confidential client)
- vuu.keycloak.allowSelfSignedCert (default false; local development only)

Alternative provider requirements:
- when vuu.auth.mode=permissive, /api/authn must accept any non-empty username/password pair
- permissive mode must construct a stable authenticated principal using the supplied username
- permissive mode must return a token/session payload in the exact Scala-compatible /api/authn token format
- permissive mode is for local development/test only and must be clearly documented as non-production

Token/session behavior:
- requests without valid auth return 401
- requests with insufficient authorization return 403
- token/session expiry must be handled with deterministic error responses
- websocket session establishment must validate the /api/authn token using Scala-compatible rules
- token validation must fail closed when token structure or required fields do not match Scala-compatible format

## Configuration Requirements
Config loading must use ConfigFactory.load() with no explicit path argument.

Discovery behavior must rely on shared ConfigFactory rules:
1. VUU_CONFIG_FILE if provided
2. VUU_APP based package selection
3. application.conf in current working directory
4. single auto-discovered packages/*/application.conf fallback

For this app, startup scripts should set:
- VUU_APP=vuu-portal

The package application.conf must define:
- vuu.certPath
- vuu.keyPath
- vuu.ssl
- vuu.keycloak.url
- vuu.keycloak.realm
- vuu.keycloak.adminUsername
- vuu.keycloak.adminPassword
- vuu.keycloak.clientId
- vuu.keycloak.clientSecret (optional)
- vuu.auth.mode

## Module Requirements
Create module namespace:
- KEYCLOAK_ADMIN

Module must register exactly these base tables:
- users
- groups
- roles
- user_group_roles

The module must include one join table:
- user_group_roles joining users, groups, and roles

Module must expose edit RPC services for Keycloak admin operations via ViewPortDef service wiring.

Required RPC names:
- addUser
- addRole
- addGroup
- addRoleToGroup
- addUserToGroup

The KeycloakAdmin module should attach a dedicated RPC service (similar to InstrumentService wiring in vuu-demo) to at least one admin table viewport so these RPCs are invokable from VUU clients.

## Table Definitions

All VUU tables in this module must include:
- vuuCreatedTimestamp: long
- vuuUpdatedTimestamp: long
- vuuMsg: string

### users
Columns:
- id: string (keyField)
- username: string
- email: string
- enabled: string
- vuuCreatedTimestamp: long
- vuuUpdatedTimestamp: long
- vuuMsg: string

Behavior:
- one row per Keycloak user

### groups
Columns:
- id: string (keyField)
- name: string
- path: string
- roles: string
- vuuCreatedTimestamp: long
- vuuUpdatedTimestamp: long
- vuuMsg: string

Behavior:
- one row per Keycloak group
- roles column contains comma-separated realm role names mapped to that group

### roles
Columns:
- id: string (keyField)
- name: string
- description: string
- vuuCreatedTimestamp: long
- vuuUpdatedTimestamp: long
- vuuMsg: string

Behavior:
- one row per Keycloak realm role

### user_group_roles
Columns:
- id: string (keyField)
- username: string
- email: string
- enabled: string
- group_id: string
- group_name: string
- role_id: string
- role_name: string
- vuuCreatedTimestamp: long
- vuuUpdatedTimestamp: long
- vuuMsg: string

Behavior:
- one row per resolved user/group/role relationship
- username/email/enabled must mirror the corresponding values from the joined users table row
- group_name must mirror the name from the joined groups table row for group_id
- role_name must mirror the name from the joined roles table row for role_id
- includes only valid mappings where each referenced user, group, and role exists in seeded scope

## Data Source Requirements
Providers must load from Keycloak Admin API.

### Authentication
- Obtain admin token from master realm token endpoint using admin-cli password grant.
- Credentials and realm configuration must be read from application.conf keys under vuu.keycloak.*

### Realm Verification
- Validate realm exists before loading table data.
- Fail fast with clear error if realm cannot be reached.

### Filtering Scope
The module should display only seeded entities associated with the local setup.

Expected user set:
- trader1
- trader2
- dev1
- dev2
- admin

Expected group set:
- BASKET_VIEW
- BASKET_TRADE
- DATA_VIEW
- USERS_VIEW
- USERS_ADMIN

Expected role set:
- basket.view
- basket.trade
- data.view
- users.view
- users.admin

## Provider Requirements
Implement providers extending vuu-server Provider:
- KeycloakUsersProvider
- KeycloakGroupsProvider
- KeycloakRolesProvider
- KeycloakUserGroupRolesProvider

Each provider must:
- fetch relevant Keycloak data
- transform to table row order exactly matching table schema
- upsert rows into table
- set loaded=true on completion

A shared KeycloakAdminClient should encapsulate:
- token acquisition
- authenticated request handling
- seeded entity retrieval
- helper calls for user groups, group role mappings, and user/group/role join expansion
- edit helpers for addUser, addRole, addGroup, addRoleToGroup, addUserToGroup

## Keycloak Edit RPC Requirements

The module must support create/assignment operations by invoking Keycloak Admin REST APIs directly (rather than mutating only in-memory VUU rows):

- addUser -> create Keycloak user
- addRole -> create realm role
- addGroup -> create realm group
- addRoleToGroup -> assign realm role mapping to a group
- addUserToGroup -> add user membership to a group

RPC behavior:
- validate required inputs and return ERROR_RESULT with explicit message on invalid/missing params
- map Keycloak HTTP errors to deterministic RPC errors
- return SUCCESS_RESULT only when Keycloak confirms the operation
- do not use silent fallbacks or partial success responses

Table update behavior after successful edit RPC:
- refresh users, groups, roles, and user_group_roles from Keycloak
- updates must be driven from Keycloak as source of truth (no write-only local upserts)
- refresh should preserve schema ordering and vuu timestamp/msg conventions

## Multi-Server Consistency Requirements

Because more than one vuu-portal server may be running, each instance must reconcile with Keycloak on a regular interval so all servers converge on the same user/group/role state.

Required behavior:
- introduce periodic Keycloak reconciliation in each portal instance
- refresh all KEYCLOAK_ADMIN tables on each cycle
- continue to support immediate post-RPC refresh on the server that handled the edit call
- interval must be configurable (for example: vuu.keycloak.sync.intervalMs) with a safe default suitable for local/dev
- failures in one refresh cycle must be surfaced in logs and retried on next cycle

## Project File Structure
Required minimum structure:

- package.json
- application.conf
- src/index.ts
- src/PortalMain.ts
- src/modules/keycloak-admin/index.ts
- src/modules/keycloak-admin/KeycloakAdminModule.ts
- src/modules/keycloak-admin/KeycloakAdminTableDefs.ts
- src/modules/keycloak-admin/KeycloakAdminClient.ts
- src/modules/keycloak-admin/services/KeycloakAdminService.ts
- src/modules/keycloak-admin/providers/KeycloakUsersProvider.ts
- src/modules/keycloak-admin/providers/KeycloakGroupsProvider.ts
- src/modules/keycloak-admin/providers/KeycloakRolesProvider.ts
- src/modules/keycloak-admin/providers/KeycloakUserGroupRolesProvider.ts
- src/modules/keycloak-admin/KeycloakAdminRefreshCoordinator.ts

## Workspace Integration
Create root start script file:
- scripts/start-portal.ts

Root package.json must include:
- start:portal script with VUU_APP=vuu-portal and bun ./scripts/start-portal.ts

For consistency, other app start scripts may also set VUU_APP to avoid ambiguous config resolution.

## Acceptance Criteria
A recreation is complete when:
1. npm run start:portal starts successfully without passing explicit ConfigFactory path.
2. ConfigFactory resolves application.conf via VUU_APP.
3. VUU server starts and logs websocket listener.
4. KEYCLOAK_ADMIN module is registered.
5. users, groups, roles, and user_group_roles tables are created.
6. providers load data from Keycloak and populate rows, including user/group/role joins.
7. REST endpoint POST /api/authn is available and Scala-compatible.
8. websocket/session access uses auth output from /api/authn with Scala-compatible semantics.
9. both auth modes are supported: keycloak (default) and permissive.
10. in both auth modes, /api/authn returns tokens in the exact Scala VUU format used by websocket login.
11. realm-not-found or auth failures produce clear startup errors.
12. code remains aligned with existing vuu-server/vuu-demo style and module patterns.
13. KEYCLOAK_ADMIN edit RPCs addUser, addRole, addGroup, addRoleToGroup, and addUserToGroup are available and invoke Keycloak Admin APIs.
14. after successful edit RPC call, all KEYCLOAK_ADMIN tables refresh from Keycloak source of truth.
15. when multiple portal servers are running, periodic reconciliation updates each server's KEYCLOAK_ADMIN tables within configured sync interval.

## Implementation Plan (Edit Admin Tables)

1. RPC service wiring
- add KeycloakAdminService extending existing rpc handler patterns
- wire service through ModuleFactory addTable(...) serviceFactory/ViewPortDef
- register addUser, addRole, addGroup, addRoleToGroup, addUserToGroup RPC functions

2. Keycloak client edit API support
- add REST helper methods in KeycloakAdminClient for required create/assignment operations
- add helper lookups for name/id resolution needed by role/group/user assignments
- normalize error mapping so RPC layer returns clear deterministic failures

3. Refresh orchestration
- implement a refresh coordinator that can reload all KEYCLOAK_ADMIN providers on demand
- invoke coordinator after successful edit RPC operations
- ensure refresh updates users/groups/roles/user_group_roles coherently in one cycle

4. Multi-server convergence
- add periodic refresh scheduler in vuu-portal startup/module wiring
- make sync interval configurable via application.conf
- keep scheduler idempotent and resilient to transient Keycloak failures

5. Validation and readiness
- confirm RPC request/response shapes follow vuu-server conventions
- confirm table data reflects Keycloak after create/assignment operations
- confirm independent portal instances converge after periodic refresh

## Non-Goals
- creating realms/clients in Keycloak
- adding extra modules, extra join tables beyond user_group_roles, or RPC menu actions
- adding additional REST resources beyond POST /api/authn in this phase
- update/delete semantics for users, groups, roles, and memberships in this phase
