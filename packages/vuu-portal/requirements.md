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
7. realm-not-found or auth failures produce clear startup errors.
8. code remains aligned with existing vuu-server/vuu-demo style and module patterns.

## Non-Goals
- editing Keycloak data from VUU
- creating realms/clients in Keycloak
- adding extra modules, joins, or RPC menu actions
- replacing existing auth/token flows in vuu-server
