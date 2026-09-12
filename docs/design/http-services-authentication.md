# HTTP services and authentication

All current VUU applications use `createVuuServerApplication`, which installs
the shared `/api/authn` handler and configures the HTTPS and WebSocket servers
from `application.conf`.

## Portal

`@heswell/vuu-portal` is the browser-facing server:

- HTTPS `8443`;
- WebSocket `wss://localhost:8091/websocket-portal`;
- portal-token validation through confidential client `vuu-portal-server`;
- navigation authorization from `resource_access.vuu-portal.roles` only; and
- `MODULE_DISCOVERY` tables plus a user-specific registry on `LOGIN_SUCCESS`.

The registry travels over the authenticated VUU WebSocket session. There is no
separate browser-facing registry HTTP endpoint, so authentication and registry
authorization cannot diverge.

## User administration

`@heswell/vuu-user-admin` is an independent server:

- HTTPS `8444`;
- WebSocket `wss://localhost:8092/websocket-user-admin`;
- Keycloak client and audience `vuu-user-admin`; and
- the `KEYCLOAK_ADMIN` module and its refresh coordinator.

The portal-issued Keycloak access token includes the user-admin server audience.
The UI exchanges it through the user-admin `/api/authn` endpoint,
then opens that server's VUU WebSocket with the returned VUU token.

Portal owns two fixed authentication profiles:

- `POST /api/authn` validates portal navigation tokens; and
- `POST /api/authn/module-admin` always exchanges into
  `vuu-module-admin-server`.

The module-admin profile issues a distinct VUU login token used with connection
ID `module-admin` at `wss://localhost:8091/websocket-portal`. It remains in the
portal process, so both portal profiles deliberately share the same stateful
`LoginTokenService`.

## Remote token exchange

Module admin, user admin, and basket trading always exchange the submitted
portal access token, even if it already has the target audience. The exchanged
token must retain the subject and username, be unexpired, contain the configured
audience and expected authorized party, and supply authorizations only from
`resource_access[authorizationClientId].roles`. Realm roles, groups, and roles
for other clients are ignored.

Profile names, client IDs, audiences, and authorization clients are server
configuration. Query parameters and request bodies cannot override them.

## Keycloak bootstrap reconciliation

`npm run keycloak:bootstrap` sets `fullScopeAllowed=false` on `vuu-portal` and
each confidential VUU client. It gives each client scope mappings for only its
owned roles: the portal gets the three navigation roles, module admin gets
`module-admin-view/edit`, user admin gets `user-admin-view/edit`, basket trading
gets `basket-trading-view/trade`, and the portal server currently has no service
roles. Known legacy roles and managed cross-client mappings are removed.
The migration also deletes the retired `vuu-module-discovery-server` client,
its portal audience mapper, and the former `modules.*`, `users.*`, and
`basket.*` realm roles. These retired identifiers remain only in bootstrap's
explicit deletion manifests so stale realms are upgraded; they are not runtime
aliases or authorization inputs.

Before issuing deletes, bootstrap loads every managed client/role-owner pair and
logs the planned additions and removals. API failures abort the run. Repeated
runs are no-ops after reconciliation. Custom role mappings whose names are not
managed by VUU, custom client scopes, and unrelated protocol mappers are
preserved. Mappings that reuse a VUU-managed role name are reconciled as managed
configuration so they cannot bypass role isolation.

Bootstrap checks current state before mutating it. A converged second run does
not recreate clients, rewrite client representations, reset seeded-user
passwords, or repeat existing group membership writes. Seed passwords are set
only when bootstrap creates a user. Managed group-role and seeded-user group
assignments are reconciled exactly, while mappings to unrelated custom roles
and groups are preserved.

The portal's four audience mappers remain enabled even though remote roles are
not included in its token. Keycloak standard exchange requires those audiences
to establish requester eligibility.

## Shared configuration

| Key | Purpose |
| --- | --- |
| `vuu.auth.mode` | `keycloak` or local `permissive` authentication |
| `vuu.auth.path` | Authentication endpoint, normally `/api/authn` |
| `vuu.auth.keycloak.clientId` | Confidential client for the VUU server |
| `vuu.auth.keycloak.clientSecret` | Client secret used for introspection/exchange |
| `vuu.auth.keycloak.audience` | Required or requested token audience |
| `vuu.auth.keycloak.audiencePolicy` | Audience validation/exchange policy |
| `vuu.auth.keycloak.authorizationClientId` | Sole `resource_access` client used for VUU authorizations |
| `vuu.auth.keycloak.expectedAuthorizedParty` | Required `azp` on the accepted token |
| `vuu.auth.keycloak.tokenExchangeEnabled` | Enables Keycloak token exchange |
| `vuu.auth.cors.allowedOrigin` | Allowed browser origin |

Confidential client secrets use these environment overrides in both bootstrap
and applications: `VUU_PORTAL_SERVER_CLIENT_SECRET`,
`VUU_MODULE_ADMIN_SERVER_CLIENT_SECRET`,
`VUU_USER_ADMIN_SERVER_CLIENT_SECRET`, and
`VUU_BASKET_TRADING_SERVER_CLIENT_SECRET`. `KEYCLOAK_ADMIN_USERNAME` and
`KEYCLOAK_ADMIN_PASSWORD` remain separate bootstrap/Admin API credentials.
Secrets are never written to logs.

## Intentional generic support

`KeycloakAuthProvider` continues to support `require-audience`,
`exchange-if-needed`, and `always-exchange`. Current remote applications use
fixed, server-owned `always-exchange` profiles, while portal navigation uses
`require-audience`; `exchange-if-needed` remains a generic library policy, not
a deployment compatibility path.

The `KEYCLOAK_ADMIN` role, group-role, and user-group-role tables also remain.
They expose live realm-role administration generically and no longer filter the
role table through the retired VUU seed-role names. VUU application
authorization roles are client roles and remain managed by bootstrap.
