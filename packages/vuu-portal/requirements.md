# VUU Portal Requirements

## Purpose
Create a new package named vuu-portal that runs a VUU server similar to vuu-demo, but focused only on exposing Keycloak administration data to VUU clients.

The service must:
- start a VUU websocket server
- register exactly one VUU module named KEYCLOAK_ADMIN
- expose three base tables: users, groups, roles
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
- when VUU_AUTH_MODE=keycloak, POST /api/authn must return a Scala-compatible VUU auth token
- token semantics, field names, encoding, and parsing behavior must match Scala VUU exactly
- user role/authorization information may be included or resolved as required by Scala-compatible token semantics
- support an alternative permissive auth provider mode for local/dev compatibility that authenticates any user credentials
- permissive mode behavior must mirror Scala AuthenticatorFromUserList-style development flow: accept the supplied username and issue a valid portal auth response

Authorization:
- enforce authentication for websocket/session flows after successful /api/authn login
- role/authorization mapping must be consistent with Scala VUU auth semantics

Configuration for auth:
- KEYCLOAK_URL (default http://localhost:8080)
- KEYCLOAK_REALM (default vuu)
- KEYCLOAK_ADMIN_USERNAME (default admin)
- KEYCLOAK_ADMIN_PASSWORD (default admin)
- KEYCLOAK_CLIENT_ID (default portal)
- KEYCLOAK_CLIENT_SECRET (optional for confidential client)
- VUU_AUTH_MODE with values keycloak or none (default keycloak)
- VUU_AUTH_MODE with values keycloak or permissive (default keycloak)

Alternative provider requirements:
- when VUU_AUTH_MODE=permissive, /api/authn must accept any non-empty username/password pair
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

## Module Requirements
Create module namespace:
- KEYCLOAK_ADMIN

Module must register exactly three base tables:
- users
- groups
- roles

No join tables are required.
No custom RPC handlers are required.

## Table Definitions

### users
Columns:
- id: string (keyField)
- username: string
- email: string
- enabled: string
- groups: string

Behavior:
- one row per Keycloak user
- groups column contains comma-separated group names

### groups
Columns:
- id: string (keyField)
- name: string
- path: string
- roles: string

Behavior:
- one row per Keycloak group
- roles column contains comma-separated realm role names mapped to that group

### roles
Columns:
- id: string (keyField)
- name: string
- description: string

Behavior:
- one row per Keycloak realm role

## Data Source Requirements
Providers must load from Keycloak Admin API.

### Authentication
- Obtain admin token from master realm token endpoint using admin-cli password grant.
- Env variables:
- KEYCLOAK_URL (default http://localhost:8080)
- KEYCLOAK_REALM (default vuu)
- KEYCLOAK_ADMIN_USERNAME (default admin)
- KEYCLOAK_ADMIN_PASSWORD (default admin)

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
Implement three providers extending vuu-server Provider:
- KeycloakUsersProvider
- KeycloakGroupsProvider
- KeycloakRolesProvider

Each provider must:
- fetch relevant Keycloak data
- transform to table row order exactly matching table schema
- upsert rows into table
- set loaded=true on completion

A shared KeycloakAdminClient should encapsulate:
- token acquisition
- authenticated request handling
- seeded entity retrieval
- helper calls for user groups and group role mappings

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
- src/modules/keycloak-admin/providers/KeycloakUsersProvider.ts
- src/modules/keycloak-admin/providers/KeycloakGroupsProvider.ts
- src/modules/keycloak-admin/providers/KeycloakRolesProvider.ts

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
5. users, groups, roles tables are created.
6. providers load data from Keycloak and populate rows.
7. REST endpoint POST /api/authn is available and Scala-compatible.
8. websocket/session access uses auth output from /api/authn with Scala-compatible semantics.
9. both auth modes are supported: keycloak (default) and permissive.
10. in both auth modes, /api/authn returns tokens in the exact Scala VUU format used by websocket login.
11. realm-not-found or auth failures produce clear startup errors.
12. code remains aligned with existing vuu-server/vuu-demo style and module patterns.

## Non-Goals
- editing Keycloak data from VUU
- creating realms/clients in Keycloak
- adding extra modules, joins, or RPC menu actions
- adding additional REST resources beyond POST /api/authn in this phase
