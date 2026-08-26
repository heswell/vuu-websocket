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
| User admin | `vuu-user-admin-server` | `8444` | `8092` |
| Basket trading | `vuu-basket-trading-server` | `8445` | `8093` |

The public `vuu-portal` client must include every backend server client in its
access-token audience. Bootstrap scripts create those clients, audience mappers,
roles, and role scopes.

`LOGIN_SUCCESS` remains backward compatible. Servers return `type` and
`vuuServerId`; portal additionally returns the optional `moduleRegistry`.
Registry authorization uses the same `VuuUser` established by WebSocket login.
