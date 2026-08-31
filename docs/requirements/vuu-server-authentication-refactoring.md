# VUU server authentication requirements

VUU applications compose authentication through
`createVuuServerApplication`. The shared `/api/authn` handler authenticates
credentials or bearer tokens and issues a short-lived VUU login token containing
the authenticated username and authorizations.

The portal and each remote server have separate Keycloak confidential clients
and audiences:

| Server | Client/audience | HTTPS | WebSocket |
| --- | --- | --- | --- |
| Portal | `vuu-portal-server` | `8443` | `8091/websocket-portal` |
| Module admin | `vuu-module-admin-server` | `8443` | `8091/websocket-portal` |
| User admin | `vuu-user-admin-server` | `8444` | `8092/websocket-user-admin` |
| Basket trading | `vuu-basket-trading-server` | `8445` | `8093/websocket-basket-trading` |

The public `vuu-portal` client must include every backend server client in its
access-token audience. Bootstrap scripts create those clients, audience mappers,
roles, and role scopes.

Each confidential client has token exchange enabled and an
explicit self-audience mapper, while `vuu-portal` access tokens retain every
confidential client as an audience. Keycloak requires a confidential requesting
client to be an audience of a subject token issued to a different client; the
self-audience mapper ensures an exchanged token can contain the requested
`audience=<same-client-id>`.

Fixed server-owned profiles are used throughout. Portal navigation remains
`POST /api/authn`; module admin uses `POST /api/authn/module-admin` in the same
portal process. User admin and basket trading retain `POST /api/authn` on ports
8444 and 8445. Remote profiles always exchange into their own client/audience
and authorize only from that exchanged token's target-client roles.

Navigation roles (`module-admin-login`, `user-admin-login`, and
`basket-trading-login`) belong to the public `vuu-portal` client. Resource roles
belong only to their corresponding confidential clients. Bootstrap disables full
scope on the public portal and all confidential VUU clients, maps each managed
client only to its own roles, and removes known legacy roles and stale managed
cross-client mappings. The portal access token therefore contains only the
navigation roles while retaining all four confidential clients in `aud`.

The exact boundary is VUU-managed role names and VUU-managed audience mappers.
Bootstrap preserves administrator-created role mappings with other names,
custom client scopes, and unrelated protocol mappers. It does not preserve a
custom mapping that reuses a VUU-managed role name, because that would defeat
role isolation.

Run `npm run keycloak:bootstrap` to migrate an existing realm safely. Re-running
the command reconciles managed clients, audience mappers, roles, and assignments
without further changes. Existing deployments must run this command after
upgrading; users retain their uppercase-group assignments but legacy role names
are removed. Cleanup includes the retired `vuu-module-discovery-server` client,
its audience mapper, legacy client and realm roles (`modules.*`, `users.*`, and
`basket.*`), and managed cross-client role scopes. The retired names remain only
as deletion manifests needed to migrate stale realms.

Generic library policies are separate from obsolete deployment compatibility.
`exchange-if-needed` remains supported by `KeycloakAuthProvider`, although
current remote profiles always exchange. Generic realm-role administration also
remains available through `KEYCLOAK_ADMIN`; those tables do not define VUU
application authorization roles.

`LOGIN_SUCCESS` remains backward compatible. Servers return `type` and
`vuuServerId`; portal additionally returns the optional `moduleRegistry`.
Registry authorization uses the same `VuuUser` established by WebSocket login.
