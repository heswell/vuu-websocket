# Requirement: `vuu-module-discovery`

## Background

Create `@heswell/vuu-module-discovery`, a Vuu server package responsible for
runtime discovery of remote modules in a module-federation application. It
will be modelled on `@heswell/vuu-portal`: construct a `VuuServer`, register a
Vuu module, configure WebSocket and HTTPS options, and participate in the
normal Vuu lifecycle.

This server is not the portal's primary authentication server. It must not
expose the portal authentication endpoint (`/api/authn`) or issue Vuu login
tokens. Its HTTPS endpoint instead accepts and validates a Keycloak access
token supplied by the caller.

## Package and Server Requirements

1. Add a package named `@heswell/vuu-module-discovery` under
   `packages/vuu-module-discovery`.
2. Provide a server entry point equivalent in responsibility to
   `packages/vuu-portal/src/PortalMain.ts`:
   - create `VuuWebSocketOptions` from configuration, including optional TLS;
   - create `VuuServerConfig` and the lifecycle container;
   - register the module-discovery Vuu module;
   - configure the HTTPS request handler for `/module-registry`;
   - start and stop through the standard Vuu lifecycle.
3. The HTTPS server must use the existing Vuu REST-server mechanism. Because
   that mechanism requires TLS, the registry endpoint is HTTPS only.
4. Do not install `createAuthnHttpHandler` and do not expose `/api/authn`.

## Vuu Data Model

The module must define the following tables. The table namespace should follow
the package's module namespace convention; the unqualified table names below
are normative.

### `modules`

| Column | Vuu type | Required | Description |
| --- | --- | --- | --- |
| `id` | `int` | Yes | Unique numeric module record identifier and table key. |
| `name` | `string` | Yes | Logical remote-module name. Multiple versions can share this value. |
| `title` | `string` | Yes | Human-readable module title for client presentation. |
| `description` | `string` | Yes | Human-readable module description. |
| `version` | `int` | Yes | Numeric module version used to choose the latest accessible version. |
| `enabled` | `boolean` | Yes | Whether this module version can be discovered. |
| `location` | `string` | Yes | Remote-module location that clients use for module-federation loading. |
| `mfComponent` | `string` | Yes | Exposed module-federation component identifier. |
| `mfScope` | `string` | Yes | Module-federation container scope. |
| `mfUrl` | `string` | Yes | URL of the module-federation remote entry. |

### `modulePermissions`

| Column | Vuu type | Required | Description |
| --- | --- | --- | --- |
| `id` | `int` | Yes | Unique numeric record identifier and table key. |
| `module_id` | `int` | Yes | ID of the related `modules` record. |
| `role` | `string` | Yes | Keycloak role that grants access to the related module. |

### `moduleUsers`

| Column | Vuu type | Required | Description |
| --- | --- | --- | --- |
| `id` | `int` | Yes | Unique numeric record identifier and table key. |
| `module_id` | `int` | Yes | ID of the related `modules` record. |
| `username` | `string` | Yes | Keycloak username that grants access to the related module. |

`modulePermissions.role` intentionally replaces the originally proposed
`modulePermissions.username` column.

The initial implementation may use in-memory providers, consistent with the
existing Vuu sample modules. It must preserve table definitions and provider
boundaries so that persistent providers can be introduced without changing
the public table contract.

### Initial Preloaded Modules

Preload the following enabled module rows when the module-discovery server
starts. These rows establish the initial registry data available for
role-authorized users.

| id | name | title | description | version | enabled | location | mfComponent | mfScope | mfUrl |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `1` | `module-admin` | Manage remote modules | Create new remote module, update existing modules | `1` | `true` | `/Modules/Manage Modules` | `ModuleAdmin` | `ModuleAdmin` | `http://localhost:5008` |
| `2` | `user-admin` | Manage users | Add, remove and update users | `1` | `true` | `/Users/Manage Users` | `UserAdmin` | `UserAdmin` | `http://localhost:5009` |

Preload the corresponding role grants in `modulePermissions`. There are no
initial `moduleUsers` rows.

| id | module_id | role |
| --- | --- | --- |
| `1` | `1` | `module-admin:view` |
| `2` | `1` | `module-admin:edit` |
| `3` | `2` | `user-admin:view` |
| `4` | `2` | `user-admin:edit` |

## Vuu Module Service

1. Register all three tables in a `ModuleFactory` module.
2. Give the editable table viewport a service extending
   `EditSessionRpcHandler`, following `InstrumentService` as the local
   implementation pattern.
3. The service is responsible for Vuu edit-session integration for module
   metadata management. It must receive the shared `TableContainer`, allowing
   module, role, and user access rows to be coordinated as needed.
4. The module must expose ordinary Vuu table schemas and viewports for the
   registered tables; it must not invent a separate management API for this
   requirement.

## HTTPS Module Registry API

### Endpoint

`GET /module-registry`

The endpoint responds with JSON:

```json
{
  "modules": [
    {
      "id": 42,
      "name": "risk",
      "title": "Risk",
      "description": "Risk analytics module",
      "version": 3,
      "enabled": true,
      "location": "https://modules.example.com/risk",
      "mfComponent": "./RiskModule",
      "mfScope": "risk",
      "mfUrl": "https://modules.example.com/risk/remoteEntry.js"
    }
  ]
}
```

Each item is a `modules` record. The response must contain only modules the
requesting user is allowed to discover.

### Authentication

1. The caller supplies the Keycloak access token in the `Authorization`
   header using the standard HTTP bearer-token authentication scheme accepted
   by the existing authentication handler.
2. Validate the token with Keycloak token introspection, using the same
   validation approach as `KeycloakAuthnProvider.authenticateBearerToken`.
   Parsing a JWT payload without validation is insufficient.
3. Resolve the requesting username from `preferred_username`, falling back to
   `username`.
4. Resolve the caller's authorization set from:
   - realm roles (`realm_access.roles`);
   - roles for the configured client
     (`resource_access[clientId].roles`); and
   - Keycloak groups, consistent with the existing portal authorization
     extraction.
5. A missing, malformed, inactive, expired, or otherwise unvalidated token
   must return `401` and must not disclose module data.

### Authorization and Selection

1. A module is accessible when either condition is true:
   - a `moduleUsers` row relates its `module_id` to the resolved username; or
   - a `modulePermissions` row relates its `module_id` to any role in the
     caller's authorization set.
2. Filter inaccessible modules and rows whose `enabled` value is `false`
   before constructing the response.
3. For each logical `name`, return at most one module: the accessible,
   enabled record with the greatest numeric `version`.
4. The result must be deterministic. If enabled, accessible records have the
   same `name` and `version`, select the one with the greatest `id`.
5. Return `200` and `{ "modules": [] }` when an authenticated user has no
   accessible enabled modules.
6. The endpoint accepts only `GET`. Return `405` for other methods and `404`
   for unrelated paths.
7. Return `Content-Type: application/json` for successful and error JSON
   responses. Error responses must not include internal table data or token
   values.

## Non-Functional Requirements

1. Reuse existing Vuu server types, module factories, table definitions, REST
   server configuration, and Keycloak validation patterns rather than
   duplicating protocol or token parsing logic.
2. Keep Keycloak connection details, client ID, TLS settings, ports, and any
   browser CORS origin policy configurable; do not hard-code deployment
   credentials or URLs.
3. Log authentication or registry-processing failures without logging access
   tokens.
4. Preserve existing behaviour in `vuu-server` and `vuu-portal`.

## Acceptance Criteria

1. The new package starts a Vuu server with the three specified tables and no
   `/api/authn` endpoint.
2. The `modules` table exposes the required fields, and both access tables
   use `module_id` plus the corrected `role` or `username` field.
3. The table service extends `EditSessionRpcHandler`.
4. A valid Keycloak token grants discovery when its username matches
   `moduleUsers.username`, when one of its authorization values matches
   `modulePermissions.role`, or both.
5. A module with `enabled: false` is absent even when the caller otherwise
   has access.
6. If a user can access multiple enabled records with the same `name`, the
   response contains exactly the highest-version record; equal versions select
   the greatest `id`.
7. A valid token with no matching user or role returns `200` with an empty
   `modules` array.
8. Missing, malformed, inactive, or failed-to-validate tokens return `401`.
9. Focused tests cover username access, role access, no access, disabled
   modules, version deduplication, equal-version determinism, and invalid
   authentication.
