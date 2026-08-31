# VUU server authentication requirements

VUU applications compose authentication through
`createVuuServerApplication`. The shared `/api/authn` handler authenticates
credentials or bearer tokens and issues a short-lived VUU login token containing
the authenticated username and authorizations.

The portal and each remote server have separate Keycloak confidential clients
and audiences:

| Server | Client/audience | HTTPS | WebSocket |
| --- | --- | --- | --- |
| Portal | `vuu-portal-server` | `8443` | `8091` |
| Module admin | `vuu-module-admin-server` | `8443` | `8091` |
| User admin | `vuu-user-admin-server` | `8444` | `8092` |
| Basket trading | `vuu-basket-trading-server` | `8445` | `8093` |

The public `vuu-portal` client must include every backend server client in its
access-token audience. Bootstrap scripts create those clients, audience mappers,
roles, and role scopes.

Phase 1 prepares standard token exchange without changing application
authentication policy. Each confidential client has token exchange enabled and an
explicit self-audience mapper, while `vuu-portal` access tokens retain every
confidential client as an audience. Keycloak requires a confidential requesting
client to be an audience of a subject token issued to a different client; the
self-audience mapper ensures an exchanged token can contain the requested
`audience=<same-client-id>`.

Phase 2 activates fixed server-owned profiles. Portal navigation remains
`POST /api/authn`; module admin uses `POST /api/authn/module-admin` in the same
portal process. User admin and basket trading retain `POST /api/authn` on ports
8444 and 8445. Remote profiles always exchange into their own client/audience
and authorize only from that exchanged token's target-client roles.

Navigation roles (`module-admin-login`, `user-admin-login`, and
`basket-trading-login`) belong to the public `vuu-portal` client. Resource roles
belong to their corresponding confidential clients. Bootstrap retains the
existing uppercase group names and adds `MODULES_VIEW`; assignments are additive,
so existing roles and cross-client scope mappings are not removed. Phase 2 portal module discovery selects exactly the public login roles. Existing
resource roles and scope mappings remain provisioned; Phase 3 tightening and
removal is intentionally out of scope.

Run `npm run keycloak:bootstrap` to migrate an existing realm safely. Re-running
the command reconciles managed clients, audience mappers, roles, and assignments
without removing unrelated administrator-managed mappers.

`LOGIN_SUCCESS` remains backward compatible. Servers return `type` and
`vuuServerId`; portal additionally returns the optional `moduleRegistry`.
Registry authorization uses the same `VuuUser` established by WebSocket login.
