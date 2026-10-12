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

## Menus and menu RPCs

An `RpcHandler` advertises a context menu by overriding `menuItems`. The
client fetches it with `GET_VIEW_PORT_MENUS` after `CREATE_VP`, and invokes an
item with one of four menu RPC messages, matching the item's context. All
four are supported, as in Scala Vuu:

| Menu item                   | Context         | Client message               | Handler                                        |
| --------------------------- | --------------- | ---------------------------- | ---------------------------------------------- |
| `SelectionViewPortMenuItem` | `selected-rows` | `VIEW_PORT_MENUS_SELECT_RPC` | `(selection, sessionId, session) => action`    |
| `TableViewPortMenuItem`     | `grid`          | `VIEW_PORT_MENU_TABLE_RPC`   | `(session) => action`                          |
| `RowViewPortMenuItem`       | `row`           | `VIEW_PORT_MENU_ROW_RPC`     | `(rowKey, row, session) => action`             |
| `CellViewPortMenuItem`      | `cell`          | `VIEW_PORT_MENU_CELL_RPC`    | `(rowKey, field, value, session) => action`    |

Every constructor takes `(name, filter, handler, rpcName)`; `filter` is a Vuu
filter the UI applies to decide whether to show the item. A cell item takes
an optional fifth `field` argument (default `"*"`, every column).

```ts
import {
  CellViewPortMenuItem,
  DefaultRpcHandler,
  NoAction,
  OpenDialog,
  RowViewPortMenuItem,
  SelectionViewPortMenuItem,
  ShowNotification,
  TableViewPortMenuItem,
  ViewPortMenu,
} from "@heswell/vuu-server";

class InstrumentService extends DefaultRpcHandler {
  get menuItems() {
    return ViewPortMenu(
      new SelectionViewPortMenuItem("Add to watchlist", "",
        (selection) => ShowNotification(`Added ${selection.rowKeys.size}`),
        "ADD_TO_WATCHLIST"),
      ViewPortMenu("Admin",
        new TableViewPortMenuItem("Reload", "",
          async ({ user }) => {
            if (!user.authorizations.includes("admin")) {
              return ShowNotification("Not permitted", "Reload");
            }
            await reload();
            return NoAction();
          },
          "RELOAD"),
      ),
      new RowViewPortMenuItem("Buy", 'currency = "GBP"',
        (rowKey, row, session) => OpenDialog(createTicket(rowKey, session)),
        "BUY"),
      new CellViewPortMenuItem("Copy ISIN", "",
        (rowKey, field, value) => ShowNotification(`${value}`),
        "COPY_ISIN", "isin"),
    );
  }
}
```

- **Session:** `session` is a `MenuRpcSession`: the `ClientSessionId`
  (`sessionId`, `channelId`) plus `requestId`, the `VuuUser` (check
  `user.authorizations` for permissions) and the `viewport`. It can be passed
  wherever a `ClientSessionId` is expected, e.g. `createSimpleSessionTable`.
  Selection handlers keep the legacy `(selection, sessionId)` signature;
  `session` is their third argument.
- **Selection:** the viewport's current server-side selection
  (`selection.rowKeys`); the client sends no row data.
- **Row and cell data:** `row` and `value` are as sent by the client, as in
  Scala Vuu. Treat them as untrusted; re-read the row from the table
  (`session.viewport.table`) if the handler acts on it.
- **Handlers may be async.** A thrown error or rejected promise is logged and
  answered with `VIEW_PORT_MENU_REJ` (`Failed to process request <id>`); it
  does not affect the session.
- **Dispatch:** the item is looked up by `rpcName` in the `menuMap` of the
  requesting viewport's own `RpcHandler` (see ServiceFactory lifecycle). The
  server replies `VIEW_PORT_MENU_REJ` if the viewport does not exist or
  belongs to another session, if there is no item `rpcName`, or if the item's
  context does not match the message type.

Handlers return a `ViewPortAction`, the protocol's `VuuRpcMenuAction`, sent
as the `action` of `VIEW_PORT_MENU_RESP`:

| Constructor                          | Wire `type`                | What vuu-ui does                                           |
| ------------------------------------ | -------------------------- | ---------------------------------------------------------- |
| `NoAction()`                         | `NO_ACTION`                | nothing                                                    |
| `ShowNotification(message, title?)`  | `SHOW_NOTIFICATION_ACTION` | shows a success toast (title defaults to "Success")        |
| `OpenDialog(table, renderComponent)` | `OPEN_DIALOG_ACTION`       | session table + `"grid"`/`"inline-form"`: session editing UI; session table + a registered component id: that component in a dialog |
| `CloseDialog()`                      | `CLOSE_DIALOG_ACTION`      | ignored by vuu-ui's default menu handling                  |

`OpenDialogViewPortAction` and `CloseDialogViewPortAction` are aliases of
`OpenDialog` and `CloseDialog`. `OpenDialog` defaults `renderComponent` to
`"grid"`, as in Scala Vuu.
