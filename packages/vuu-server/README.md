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
