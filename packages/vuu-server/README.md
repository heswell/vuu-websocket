# @heswell/vuu-server

A TypeScript implementation of the Vuu view server: tables, joins,
viewports, RPC, menus, visual links, and the websocket and HTTP endpoints
the Vuu UI talks to.

```sh
npm install @heswell/vuu-server
```

## Runtime

The server runs under [Bun](https://bun.sh) (it uses `Bun.serve`,
`Bun.file` and Bun websockets). The package is ESM only and has no
import-time side effects, so its types, tables and helpers can be imported
anywhere; Bun is only needed when a server is started.

Some declarations reference Bun types (for example `ServerWebSocket`), so
TypeScript consumers should install `@types/bun`. It is an optional peer
dependency. `@vuu-ui/vuu-protocol-types` and `@vuu-ui/vuu-data-types` are
peer dependencies used by the declarations.

Everything is exported from the package root; there are no supported deep
imports.

## Starting a server

```ts
import {
  ConfigFactory,
  createConfiguredAuthProviders,
  createVuuServerApplication,
} from "@heswell/vuu-server";

const config = ConfigFactory.load(); // or ConfigFactory.load("./application.conf")
const application = createVuuServerApplication({
  authProviders: createConfiguredAuthProviders(config),
  config,
  defaultHttpsPort: 8444,
  defaultWebSocketPath: "/websocket-my-app",
  defaultWebSocketPort: 8092,
  modules: [myModule],
});
await application.start();
```

The `default*` options are fallbacks used only when `application.conf` does
not set `vuu.https.port`, `vuu.websocket.port` or `vuu.websocket.path`.
`ConfigFactory` comes from
[`@heswell/service-utils`](../service-utils/README.md): see its README for
how the conf file is located, `${?VAR}` environment overrides, programmatic
overrides and path resolution.

`vuu.websocket.path` must be an absolute URL path such as
`/websocket-portal`. The default is `/websocket`. Paths with a trailing
slash, query, fragment, or full URL are rejected during application setup.

## TLS and local plain-HTTP mode

`vuu.ssl=true` (with `vuu.certPath` and `vuu.keyPath`) serves the websocket
as `wss://` and the REST server (`/api/authn`, the admin api and any
`additionalHttpHandlers`) as `https://` on `vuu.https.port`.

For local development and tests, TLS can be switched off, but only with
permissive auth:

```hocon
vuu.ssl=false
vuu.auth.mode="permissive"
vuu.auth.permissive.users=""   # optional username:password list
vuu.https.port=8443            # REST port; serves plain http when vuu.ssl=false
vuu.websocket.port=8091
```

The websocket is then `ws://` and REST is `http://` on the same
`vuu.https.port` (there is no separate `vuu.http.port` key). Routes, CORS
and token responses (JSON body plus `vuu-auth-token` header) are unchanged,
and a warning is logged at startup. With `vuu.ssl=false` and any other auth
mode (e.g. `keycloak`) the server refuses to start with
`PLAIN_HTTP_REST_REQUIRES_PERMISSIVE_AUTH`. The effective auth mode is
`vuu.auth.mode`, else `VUU_AUTH_MODE`, else `keycloak`
(`getConfiguredAuthMode(config)`).

Use port `0` for ephemeral ports; `server.webSocketPort`, `server.restPort`
and `server.restUrl` report the bound values once started.

## How it fits together

VuuServer makes use of a number of global singletons

- moduleContainer
- tableContainer
- joinTableProvider

1. call VuuServerConfig

   - withModule adds a module spec
     - addTable
       - tableDef
       - providerFactory
       - serviceFactory
     - addJoinTable
       - JoinTableFactory
       - serviceFactory (optional, registered under the realised join
         table's name)

2. VuuServer constructor

   - creates the ProviderContainer
   - registers each module from the config
     - register with moduleContainer
     - for each tableDef of module
       - set module on tableDef
       - call createTable or createJoinTable
       - call registerProvider (table, provider)
         - register with providerContainer

3. `application.start()`

   - starts each provider (`provider.load`) and module
   - starts the HTTP server (auth and admin routes) and the websocket server
   - each websocket connection gets a client session
     (`ClientConnectionCreator`); incoming messages go through
     `RequestProcessor` to the core server API (`CoreServerApiHandler`):
     login, create/change/remove viewport, RPC, menus and visual links
   - viewport updates are queued per session and flushed to the client

Mocking the VuuServer: provide a mock provider in the module config.

## ServiceFactory lifecycle

A `ServiceFactory` (the optional last argument to `addTable`,
`addSessionTable` and `addJoinTable`) returns a `ViewPortDef`: the columns
plus the `RpcHandler` that serves RPC calls and menus for a viewport.

- **When it is called:** once per viewport, on `CREATE_VP`. It is not called
  for `GET_TABLE_META`; table metadata comes from the table's `TableDef`
  columns, so `ViewPortDef.columns` should describe the table's columns.
- **What is per viewport:** the returned `ViewPortDef` and its `RpcHandler`
  belong to the viewport they were created for, so a handler may hold
  per-viewport state. A factory may also return a shared, stateless handler.
- **What must be idempotent:** the factory runs once per viewport for the
  life of the server. Work with global side effects (subscriptions, timers,
  shared registrations) must be idempotent or done outside the factory.
  `DefaultRpcHandler` shares one typeahead handler per `TableContainer`, and
  `registerRpc` ignores a repeat registration of the same function under the
  same name.

Join tables take a `ServiceFactory` too:

```ts
ModuleFactory.withNameSpace("EXCHANGE")
  .addJoinTable(
    (tableDefs) =>
      JoinTableDef({
        name: "instrumentPrices",
        // ...
        permissionFunction: (viewport, tableContainer) => /* ... */,
      }),
    (table, _provider, _providerContainer, tableContainer) =>
      ViewPortDef(table.tableDef.columns, new MyRpcHandler(tableContainer)),
  )
  .asModule();
```

`JoinTableDef` passes all remaining `TableDefConfig` fields, including
`permissionFunction`, to the underlying `TableDef`.
