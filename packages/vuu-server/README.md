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
peer dependencies used by the declarations, and `@vuu-ui/vuu-utils` is a peer
dependency used at runtime. Each is declared as `^4.0.0-alpha.20`, so the
application's own `@vuu-ui` version (any later 4.0.0 prerelease or 4.x release)
is shared rather than duplicated. npm 7+ and bun install missing peers
automatically.

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

## Sessions per user

A login opens a session on the websocket it was sent on. The number of
sessions a user may hold at once is limited:

```hocon
vuu.server.maxSessionsPerUser=1             # default 1
vuu.server.sessionLimitPolicy="evict-oldest" # or "reject-new"
```

Programmatically: `VuuWebSocketOptions().withMaxSessionsPerUser(3, "reject-new")`.

- **`evict-oldest`** (default): a login beyond the limit evicts the user's
  oldest session. The evicted session is torn down completely: its viewports,
  session tables and edit sessions are removed, and its websocket is closed
  with code `4001` (`VuuCloseCode.SessionEvicted`), reason
  `session evicted: user logged in again`. A request still in flight on the
  evicted session is not answered, and anything it created is removed.
  So with the default of 1, a second tab or a reconnect takes over from the
  first. Raise `maxSessionsPerUser` to allow several tabs per user.
- **`reject-new`**: the new login is refused and its websocket closed with
  `4003` (`SessionLimitReached`). The open sessions are unaffected.

A session id is only accepted on the websocket that logged in. A message for
an unknown, evicted or foreign session gets the text frame
`Invalid session <id>` and the websocket is closed with `4002`
(`InvalidSession`). When a websocket closes for any reason, its sessions are
torn down straight away (not at the heartbeat timeout) and no longer count
towards the limit.

Websocket close codes (`VuuCloseCode`):

| Code | Name | When |
| --- | --- | --- |
| 4001 | `SessionEvicted` | the user logged in again beyond `maxSessionsPerUser` |
| 4002 | `InvalidSession` | message for an unknown or foreign session |
| 4003 | `SessionLimitReached` | login refused under `reject-new` |
| 4004 | `LoginFailed` | invalid or expired token |
| 4005 | `HeartbeatTimeout` | the client stopped responding |

## Error handling

A failing request never stops the server or closes the websocket. Every
message handler, core and module (RPC, menus, service factories), is awaited
and its error caught. The client gets the protocol's reply for a failure:

| Request | Reply on failure |
| --- | --- |
| `CREATE_VP` | `CREATE_VP_REJECT` |
| `RPC_REQUEST` | `RPC_RESPONSE` with an `ERROR_RESULT` |
| menu RPCs | `VIEW_PORT_MENU_REJ` |
| `SELECT_ROW`, `DESELECT_ROW`, `SELECT_ROW_RANGE`, `SELECT_ALL`, `DESELECT_ALL` | the matching `*_REJECT` |
| anything else, e.g. `GET_TABLE_META`, unparseable JSON | `ERROR` |

Expected refusals, such as an unknown table (`table not found <name>`) or a
viewport of another session (`viewport not found <id>`), are thrown as a
`ClientRequestError` (or `TableNotFoundError` / `ViewportNotFoundError`). They
are logged at `warn`, without a stack trace, and their `reason` is sent to
the client. Anything else is a bug: it is logged at `error` with the stack
through the `vuu.*` loggers (`vuu.rpc` for RPC and menus, `vuu.core`
otherwise), and the client gets `Failed to process request <requestId>`.
Throw a `ClientRequestError` from module code to refuse a request with a
specific message.

As a last resort, `application.start()` installs a process-wide
`unhandledRejection` handler that logs at `error` instead of letting a stray
promise end the process. Opt out with
`vuu.server.unhandledRejectionGuard=false` or the
`unhandledRejectionGuard: false` option. It is off by default under
`bun test` (`NODE_ENV=test`), so tests still see such bugs.
`installUnhandledRejectionGuard()` installs it outside the application.

## Logging

vuu-server logs through the leveled logger in
[`@heswell/service-utils`](../service-utils/README.md#logging), re-exported
here as `getLogger`, `setLogLevel`, `setLogSink`, `configureLogging` and
friends. `createVuuServerApplication` applies the level from config:

```hocon
vuu.log.level="info"            # trace | debug | info | warn | error | silent
vuu.log.level=${?VUU_LOG_LEVEL}
vuu.log.levels.vuu.viewport=debug   # optional per-logger override
```

At the default `info` level only startup (listening addresses) and
warnings/errors are logged. Table, module, viewport, session and RPC
activity is at `debug` (the module dump in `ModuleFactory` is at `trace`).
Without a conf, `VUU_LOG_LEVEL` sets the initial level, e.g.
`VUU_LOG_LEVEL=debug bun test`. Use `setLogSink` to capture or redirect
output.

## TLS and local plain-HTTP mode

`vuu.ssl=true` (with `vuu.certPath` and `vuu.keyPath`) serves the websocket
as `wss://` and the REST server (`/api/authn`, the admin api and any
`additionalHttpHandlers`) as `https://` on `vuu.https.port`.

For local development and tests, TLS can be switched off, but only with
permissive auth:

```hocon
vuu.ssl=false
vuu.auth.mode="permissive"
vuu.auth.permissive.users=""   # optional username[:password] list
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

## REST authentication (`/api/authn`)

`POST /api/authn` (path: `vuu.auth.path`) exchanges either a bearer token
(`Authorization: Bearer ...`, keycloak mode) or a JSON
`{ "username": ..., "password": ... }` body (permissive mode) for a VUU
token. A successful response carries the token in **both** places, and
clients may read either:

- the JSON body, `{ "token": "..." }`
- the `vuu-auth-token` response header (listed in
  `Access-Control-Expose-Headers`, so browsers can read it cross-origin)

No cookie is set. Failures return `400` (malformed body), `401`
(authentication failed) or `503` (identity provider unavailable) with a
generic `{ "error": ... }` body.

### Permissive mode

`vuu.auth.mode="permissive"` is for local development and tests:

- With `vuu.auth.permissive.users` empty, any username is accepted with any
  password, including an empty or missing one.
- `vuu.auth.permissive.users` is a comma-separated list of
  `username:password` entries, or a bare `username` for a user that may use
  any password. When it is set, only the listed users are accepted, and a
  user listed with a password must supply it.
- A username is always required.

Other credential providers (anything without `allowsEmptyPassword: true` on
the `CredentialAuthProvider`) still reject an empty or missing password with
`401` before the provider is called.

### CORS

```hocon
vuu.auth.cors.allowedOrigins=["http://localhost:5100", "http://127.0.0.1:5100"]
vuu.auth.cors.allowedOrigins=${?VUU_CORS_ALLOWED_ORIGIN}
vuu.auth.cors.allowedOrigins=${?VUU_CORS_ALLOWED_ORIGINS}
```

- `vuu.auth.cors.allowedOrigins` is a list (as above) or a comma-separated
  string. The legacy single-value key `vuu.auth.cors.allowedOrigin` still
  works, also accepts a comma-separated string, and is merged with the list.
  With neither set the default is `http://localhost:5002`.
- The stock confs let `VUU_CORS_ALLOWED_ORIGINS` (or the legacy
  `VUU_CORS_ALLOWED_ORIGIN`) replace the list with a comma-separated list,
  e.g. `VUU_CORS_ALLOWED_ORIGINS=http://localhost:5100,http://127.0.0.1:5100`.
- Each entry must be an origin (`scheme://host[:port]`); a trailing slash is
  dropped and anything with a path, query or fragment refuses to start.
- A request whose `Origin` is in the list gets that origin echoed in
  `Access-Control-Allow-Origin` (never the whole list), with
  `Access-Control-Allow-Credentials: true` and `Vary: Origin`.
- Preflight (`OPTIONS`) from an allowed origin returns `204` with the allowed
  methods (`POST, OPTIONS`), headers (`Authorization, Content-Type`) and
  `Access-Control-Max-Age: 600`. From any other origin it returns `403`
  without CORS headers.
- `"*"` allows any origin, but only with `vuu.auth.mode="permissive"` (the
  server refuses to start otherwise). It is sent as
  `Access-Control-Allow-Origin: *` and never with credentials.

The same list applies to every auth profile path (`/api/authn/<profile>`).
The websocket upgrade does not check `Origin`; it is authenticated by the
VUU token in the `LOGIN` message. The admin api sends no CORS headers.
`getConfiguredAllowedOrigins(config, authMode)` and `parseAllowedOrigins`
are exported for applications that serve their own REST endpoints, and
`createAuthHttpHandler` takes `allowedOrigins` (and the deprecated
`allowedOrigin`) directly.

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

## Edit sessions and RPC handlers

`EditTableRpcHandler` serves the edit RPCs (`editCell`, `addRow`,
`deleteRow`, `deleteSelectedRows`, `undoRowChange`).
`EndEditSessionRpcHandler` adds `endEditSession`, and
`CreateSessionTableRpcHandler` adds `createSessionTable` and
`beginEditSession`. An edit session copies source rows into a session table
owned by the requesting client session. Edits are made to the session table
and applied to the source table when the session is saved.

### Secure defaults

- **Session tables only.** Every edit RPC targets a session table. `editCell`
  on a viewport over a source table returns `ERROR_RESULT`, unless the
  handler opts in with `canEditSource`.
- **Session tables and viewports are private.** Only the client session
  that created a session table can open a viewport on it or call edit RPCs
  against it. Requests naming a viewport owned by another session are
  refused as if the viewport did not exist. This covers RPCs, menus,
  selection, range, change, remove, enable/disable, tree open/close and
  visual links. A refusal is expected, so it is logged at `warn` without a
  stack trace.
- **Validated columns and values.** `editCell` refuses:
  - unknown columns;
  - the key column;
  - the system columns (`vuuCreatedTimestamp`, `vuuUpdatedTimestamp`,
    `vuuMsg`, `vuu_action`; see `VUU_SYSTEM_COLUMNS`);
  - values that don't match the column's `serverDataType`.

  Numeric and boolean strings (`"42"`, `"true"`) are coerced (see
  `coerceCellValue`).
- **Row permissions.** The table's `permissionFunction` applies to editing
  as well as reading:
  - `beginEditSession` / `createSessionTable` copy only rows visible to the
    user. "Selected" ignores keys that aren't visible.
  - A hidden row can't be selected.
  - `editCell`, `deleteRow`, `deleteSelectedRows` and `undoRowChange` report
    a hidden row as not found.
  - A save is refused if it would delete or edit a hidden source row, or add
    or edit a row so that it falls outside the user's permissions.
- **Atomic saves.** If the save fails (a vetoed `canSaveSession`, an
  `applySessionSave` that returns `false` or `ERROR_RESULT`, or one that
  throws), the RPC returns `ERROR_RESULT` with the reason. The session table
  stays open and unchanged, so the user can retry or cancel. The default
  `applySessionSave` rolls back changes already applied to the source table
  if a later change fails.
- **Stale rows are detected on any table.** When a source row is copied into
  the session, the session keeps a snapshot of it. At save, every edited or
  deleted row is compared with the live source row on all columns. If
  anything changed (or the row was deleted), the save fails with
  `ERROR_RESULT` `"stale update"`, the session stays open, and the row's
  `vuuMsg` names it: `stale:<key>:<changed columns>`. The table does not need
  a `vuuUpdatedTimestamp` column. `undoRowChange` re-bases the row on the
  live source row, and `force: true` saves over stale rows. For tables with
  ticking columns (e.g. market prices) that should not block a save,
  override `getStaleColumns(sourceTable, sourceRow, change)` to ignore them.

### Hooks

Handlers are created per viewport (see above). Hooks receive the
`RequestContext` as `ctx` (`validateCellEdit` as `edit.ctx`), with
`ctx.session` and `ctx.user` (including `authorizations`). Decisions can
therefore depend on the user and their roles.

| Hook (protected) | Default | Purpose |
| --- | --- | --- |
| `canEditSource(viewport, column, ctx)` | `false` | Allow `editCell` to write directly to a non-session (shared) table. Edits are still column, type and permission checked, and `vuuUpdatedTimestamp` is bumped. |
| `isEditableColumn(table, column, viewport, ctx)` | `true` unless key or system column | Restrict which columns `editCell` accepts. `vuu_action` is never editable. |
| `validateCellEdit(edit: CellEdit)` | no error | Business validation, after the type and permission checks. Return an error message to refuse the edit. |
| `isRowAccessible(viewport, key)` | permission filter | Whether a row is visible to the user. For session tables, checks the source row. |
| `prepareSessionSave(sessionTable, force, ctx)` | permission and stale-row checks | Build the changes to save, or return an `ERROR_RESULT`. |
| `canSaveSession(viewport, prepared, ctx)` | `true` | Authorise a save before it is applied. Return `false` or a reason string to refuse it. May be async. |
| `getStaleColumns(sourceTable, sourceRow, change)` | all columns that differ from the session snapshot | Decide which concurrent source changes make a row stale. Return `[]` to accept the row. |
| `applySessionSave(sessionTable, prepared, ctx)` | apply atomically, close the session | Return `false` or `ERROR_RESULT`, or throw, to report a failed save. May be async. `ctx` is the same context `canSaveSession` gets, for user-aware saves. |

```ts
class OrderEditService extends CreateSessionTableRpcHandler {
  protected isEditableColumn(_table, column: string) {
    return column === "quantity" || column === "price";
  }
  protected validateCellEdit({ column, value }: CellEdit) {
    if (column === "quantity" && (value as number) <= 0) {
      return "quantity must be positive";
    }
  }
  protected canSaveSession(_vp, _prepared, ctx: RequestContext) {
    return ctx.user.authorizations.includes("trader") || "traders only";
  }
}
```

A module that edits a shared table directly, e.g. a reference data grid,
opts in explicitly:

```ts
protected canEditSource(viewport: Viewport) {
  return viewport.dataTable.name === "instruments";
}
```
