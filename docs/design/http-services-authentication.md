# HTTP services and authentication

All current VUU applications use `createVuuServerApplication`, which installs
the shared `/api/authn` handler and configures the HTTPS and WebSocket servers
from `application.conf`.

## Portal

`@heswell/vuu-portal` is the browser-facing server:

- HTTPS `8443`;
- WebSocket `8091`;
- Keycloak client and audience `vuu-portal-server`; and
- `MODULE_DISCOVERY` tables plus a user-specific registry on `LOGIN_SUCCESS`.

The registry travels over the authenticated VUU WebSocket session. There is no
separate browser-facing registry HTTP endpoint, so authentication and registry
authorization cannot diverge.

## User administration

`@heswell/vuu-user-admin` is an independent server:

- HTTPS `8444`;
- WebSocket `8092`;
- Keycloak client and audience `vuu-user-admin-server`; and
- the `KEYCLOAK_ADMIN` module and its refresh coordinator.

The portal-issued Keycloak access token includes the user-admin server audience.
The UI exchanges or validates it through the user-admin `/api/authn` endpoint,
then opens that server's VUU WebSocket with the returned VUU token.

## Token-exchange preparation

Keycloak bootstrap also manages the reserved `vuu-module-admin-server` client.
All confidential VUU clients have standard token exchange enabled, expose their
own audience on exchanged access tokens, and remain audiences of tokens issued
to `vuu-portal`. This is additive preparation only: current application
authentication handlers, audience policies, runtime role extraction, full-scope
settings, and active cross-client role scope mappings remain unchanged.

The public `vuu-portal` client owns navigation-only login roles. Module admin,
user admin, and basket trading permissions use resource roles owned by the
corresponding confidential server client. Existing resource roles remain
provisioned and assigned while the unchanged application authorization code
still consumes them.

## Shared configuration

| Key | Purpose |
| --- | --- |
| `vuu.auth.mode` | `keycloak` or local `permissive` authentication |
| `vuu.auth.path` | Authentication endpoint, normally `/api/authn` |
| `vuu.auth.keycloak.clientId` | Confidential client for the VUU server |
| `vuu.auth.keycloak.clientSecret` | Client secret used for introspection/exchange |
| `vuu.auth.keycloak.audience` | Required or requested token audience |
| `vuu.auth.keycloak.audiencePolicy` | Audience validation/exchange policy |
| `vuu.auth.keycloak.tokenExchangeEnabled` | Enables Keycloak token exchange |
| `vuu.auth.cors.allowedOrigin` | Allowed browser origin |
