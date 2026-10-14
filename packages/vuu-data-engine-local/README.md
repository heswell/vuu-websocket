# @heswell/vuu-data-engine-local

A browser-hosted Vuu data layer built on the runtime-agnostic data engine packages
[`@heswell/vuu-table`](https://www.npmjs.com/package/@heswell/vuu-table) and
[`@heswell/vuu-viewport`](https://www.npmjs.com/package/@heswell/vuu-viewport). The same
engine runs in the vuu-websocket (Bun) server.

The package runs alongside `@vuu-ui/vuu-data-test` and has the same public API. It is
meant to replace the `VuuModule` / `TickingArrayDataSource` core in that package. The
two packages don't depend on each other.

## Peer dependencies

All `@vuu-ui` packages are peers declared as `^4.0.0-alpha.20`, so the engine uses the host
application's single copy of each (a second `@vuu-ui/vuu-utils` or `@vuu-ui/core` would mean
a second set of React contexts). They are `@vuu-ui/vuu-utils` and `@vuu-ui/vuu-filter-parser`
(runtime), `@vuu-ui/core` (React provider), and the type-only `vuu-data-types`,
`vuu-filter-types`, `vuu-protocol-types` and `vuu-table-types`.

## Architecture

| Component                              | Role                                                                                                                                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Table`                                | A façade over the engine `Table` that keeps the existing `Table` API. Inserts, updates and deletes go straight to the engine. Every change notifies subscribed viewports.                                                               |
| `LocalEngine`                          | An isolated in-browser Vuu server: the registered `VuuModule`s and a `TableContainer` of their tables. No React or DOM dependency.                                                                                                      |
| `TableContainer`                       | A registry of tables, including join tables, keyed by `{module, table}`. Each engine has its own.                                                                                                                                       |
| `EngineDataSource`                     | A `DataSource` implementation backed by an engine `Viewport`. It handles windowing, sort, filter, groupBy, selection (including select-all), freeze, base filter, link filter and permission filter. Row updates are batched per frame. |
| `ModuleDataSource`                     | Extends `EngineDataSource` with the module features: RPC and menu services, edit sessions, and visual links. `TickingArrayDataSource` is a deprecated alias.                                                                            |
| `VuuModule`                            | Creates `ModuleDataSource` instances. Row permissions are passed to the engine as a `permissionFilter` predicate. Edit sessions can be customised per table with edit hooks.                                                            |
| `RuntimeVisualLink`                    | When the parent's selection changes, sets the child's engine link filter.                                                                                                                                                               |
| `UpdateGenerator` / `TickingGenerator` | Simulated ticking data that writes into the engine tables.                                                                                                                                                                              |

## Usage

Importing the package has no side effects: no modules, tables or timers are created
until you ask for them.

```ts
import {
  createLocalEngine,
  createLocalVuuServer,
  registerDemoModules,
} from "@heswell/vuu-data-engine-local";

// Your own modules, in an isolated engine
const engine = createLocalEngine({ modules: [new OrdersModule()] });
const dataSource = engine.createDataSource({
  module: "ORDERS",
  table: "parentOrders",
});
await dataSource.subscribe({ range: { from: 0, to: 100 } }, callback);
engine.dispose(); // disposes its modules and stops their timers

// A local Vuu server for a local-mode AuthenticationProvider (new engine per server)
const server = createLocalVuuServer({
  connectionId: "orders",
  modules: [new OrdersModule()],
});
// server.DataSourceProvider, server.engine

// The demo SIMUL, BASKET and TEST modules
const { simulModule } = registerDemoModules(createLocalEngine());
```

### Engines

| API                                                        | Description                                                                                                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createLocalEngine({ modules? })`                          | A new, isolated `LocalEngine`. Two engines, or two modules in one engine, can use the same table names.                                                    |
| `engine.register(module)` / `unregister(name)`             | Add or remove a module and its tables. A module is attached to the first engine it is registered with.                                                     |
| `engine.getModule(name)`, `hasModule`, `modules`           | Look up modules.                                                                                                                                           |
| `engine.getTableList()`                                    | `VuuTable[]` (`{module, table}`) for every registered module.                                                                                              |
| `engine.getTableSchema(vuuTable)`                          | A table's schema.                                                                                                                                          |
| `engine.createDataSource(vuuTable, vp?, cfg?)`             | A `ModuleDataSource` for a table.                                                                                                                          |
| `engine.tableContainer`                                    | The engine's `TableContainer`. Tables are keyed by `{module, table}`; a bare table name is accepted only if exactly one module has a table with that name. |
| `engine.dispose()`                                         | Unregisters every module and disposes those attached to this engine (stopping ticking data and timers).                                                    |
| `createDataSourceProvider(engine)`                         | A React provider installing the legacy and core data contexts for the engine.                                                                              |
| `createLocalVuuServer({ connectionId, modules, engine? })` | A `LocalVuuServer` (`{connectionId, DataSourceProvider, engine}`). Uses a new engine unless one is passed.                                                 |
| `registerDemoModules(engine?)`                             | Creates the SIMUL, BASKET and TEST demo modules and registers them with `engine` (default: the default engine).                                            |
| `getDefaultEngine()` / `resetDefaultEngine()`              | The shared engine behind the deprecated globals below.                                                                                                     |

### Edit sessions: hooks and service overrides

The built-in edit-session RPC services (`createSessionTable`, `editCell`, `addRow`, `deleteRow`,
`undoRowChange`, `endEditSession`, …) can be overridden by `rpcName`, per module with
`moduleServices` or per table with `services`. Precedence: table services, then module
services, then the built-ins. Services registered for a source table also apply to its
session tables.

Most customisation needs only edit hooks, which mirror vuu-server's. Implement them per
table with `editHooks` (these win), or for every table as protected methods of the module.

| Hook                                              | Default                                                                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canEditSource(column, ctx)`                      | `true`: editCell may write directly to a source table (outside a session).                                                                                                   |
| `isEditableColumn(table, column, ctx)`            | Any column except the key and the system columns (`vuuCreatedTimestamp`, `vuuUpdatedTimestamp`, `vuuMsg`, `vuuAction`). The key of a row added in the session may be edited. |
| `validateCellEdit(edit)`                          | Accept. Return an error message to refuse the edit.                                                                                                                          |
| `getStaleColumns(sourceTable, sourceRow, change)` | `defaultGetStaleColumns`: for editCell, the edited columns that changed in the source since the row was copied into the session; for deleteRow, any column.                  |
| `canSaveSession(prepared, ctx)`                   | `true`. Return `false` or a reason to refuse the save. May be async.                                                                                                         |
| `applySessionSave(sessionTable, prepared, ctx)`   | `defaultApplySessionSave`: writes the changes to the source table atomically. May be async.                                                                                  |

```ts
class OrdersModule extends VuuModule<"parentOrders" | "childOrders"> {
  protected editHooks = {
    parentOrders: {
      canSaveSession: ({ changes }) =>
        changes.every(({ cellUpdates }) => Number(cellUpdates.qty) > 0) ||
        "qty must be positive",
      // amend orders through the order service instead of writing the table
      applySessionSave: (_sessionTable, { changes }) =>
        orderService.amend(changes),
    },
  };
  // ...
}
```

`endEditSession({ save: true })`:

1. Rows already handled by `beforeSessionSave` (with a `vuuMsg`) are skipped.
2. Changes are prepared. A row added with an existing key fails with `"duplicate key"`; a
   source row that is missing or stale fails with exactly `"stale update"` (vuu-ui's
   `VuuDataSource` matches this string and throws `StaleUpdateError`). Setting
   `params.force` skips the stale check. The affected session rows get a `vuuMsg`
   (`stale:<key>:<columns>`, `<action>:<key>:source row missing`,
   `addRow:<key>:key already exists`).
3. `canSaveSession`, then `applySessionSave`. A refusal or failure (`false`, an
   `ERROR_RESULT`, or a thrown error) leaves the session open, so the user can retry or
   cancel. Exported messages: `STALE_UPDATE`, `DUPLICATE_KEY`, `SAVE_NOT_PERMITTED`,
   `SAVE_FAILED`.
4. `afterSessionSave`, then the session rows are reset (deleted rows removed, `vuuAction`
   and `vuuMsg` cleared, snapshots refreshed).

### Ranges

`subscribe({ range })`, `dataSource.range = …` and `setRange` accept a vuu-utils `Range` or
a plain `{from, to}`.

### Deprecated globals and the `/legacy` entry

`tableContainer`, `LocalDataSourceProvider` and `ensureVuuModule` use the default engine
(`getDefaultEngine()`). `@heswell/vuu-data-engine-local/legacy` re-exports the main entry and,
on import, registers the demo modules with the default engine, exporting the instances
`simulModule`, `basketModule`, `testModule`, `moduleAdminModule`, `userAdminModule` and
`notificationsModule` as 2.x did. It is the only entry point with side effects
(`"sideEffects": ["./src/legacy.ts"]`).

## Migrating from 2.x

These are breaking changes; the next release should be 3.0.0.

| 2.x                                                                                                                                           | 3.x                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Importing the package created and registered SIMUL, BASKET, TEST, MODULE_DISCOVERY, USER_ADMIN and NOTIFICATIONS, and exported the instances. | Nothing is created on import. Call `registerDemoModules()` or create the modules yourself, or import `/legacy`.                                                                                |
| `new SomeModule()` registered itself in a global module container.                                                                            | Register modules with an engine: `createLocalEngine({ modules })`, `engine.register()`, or `createLocalVuuServer`.                                                                             |
| `createLocalVuuServer` registered its modules globally, so `LocalDataSourceProvider` saw them.                                                | Each server has its own engine (`server.engine`). Pass `engine: getDefaultEngine()` to share the default engine.                                                                               |
| `tableContainer` was global and keyed by bare table name.                                                                                     | Each engine has its own, keyed by `{module, table}`. The global `tableContainer` is a deprecated alias of the default engine's; a bare name throws if two modules have a table with that name. |
| `ModuleContainer` / `moduleContainer`.                                                                                                        | Removed: use `LocalEngine`.                                                                                                                                                                    |
| Module and table `services` were added alongside the built-in edit services.                                                                  | They override built-in services with the same `rpcName`.                                                                                                                                       |
| editCell could change the key and system columns, and edit missing or deleted rows.                                                           | Refused by default (see `isEditableColumn`). Editing a missing row returns an error.                                                                                                           |
| `endEditSession` saved without checking for concurrent source changes or duplicate keys.                                                      | Fails with `"stale update"` or `"duplicate key"` (unless `force`). After a successful save the session rows are reset.                                                                         |
| Demo prices and notifications ticked from import.                                                                                             | They start when a data source is created, and stop on `engine.dispose()`.                                                                                                                      |
| Reference data (`instrumentsTable`, `pricesTable`, `instrumentsData`, …) was created on import.                                               | Lazy getters and factories (`getInstrumentsData()`, `createPricesTable()`, …).                                                                                                                 |

## Differences from `@vuu-ui/vuu-data-test`

- `PermissionFilteredTable` has been removed. Use the `permissionFilter` predicate on the data source instead.
- Visual links use the engine link filter, so the client no longer filters rows by selection.
- Grouped rows are only available from `getRowAtIndex` when they fall within the client range. Flat rows are available at any index.
- Re-inserting a row with an existing key updates that row.
- Table keys must not be empty.

## Running the vuu showcase against the engine

In the finos/vuu `vuu-ui` workspace:

```sh
npm run showcase:engine   # equivalent to: VUU_DATA_ENGINE=local npm run showcase
```

This aliases `@vuu-ui/vuu-data-test` to `@heswell/vuu-data-engine-local` in the showcase
rsbuild config. The examples themselves don't change. The examples use the eagerly created demo
modules, so from 3.0 the alias should point to `@heswell/vuu-data-engine-local/legacy`.

The showcase uses the published package. To publish it from vuu-websocket:

```sh
npm run pub -- --package=@heswell/vuu-data-engine-local --tag alpha
```

## Performance

`bench/datasource.bench.ts` compares the legacy `TickingArrayDataSource`
(`@vuu-ui/vuu-data-test`) with the engine `ModuleDataSource` on the same data and scenarios.
`@vuu-ui/vuu-data-test` is a dev dependency, used only for this comparison.

```sh
npm run bench:data-engine-local                    # 100k rows
BENCH_ROWS=10000 npm run bench:data-engine-local   # smaller run
```

`requestAnimationFrame` is made synchronous during the bench, so each timing includes delivering
rows to the client. The bench runs under vitest (Node) using `vitest.config.ts` in this
package; the tests run under `bun test`. `test/LegacyParity.test.ts` checks that both implementations give the same
results for the sort, filter and groupBy scenarios.

Mean time per operation, 100k rows, Node 24, Apple Silicon:

| Scenario                          | legacy  | engine  | speed-up |
| --------------------------------- | ------- | ------- | -------- |
| create + subscribe                | 24.1 ms | 8.7 ms  | 2.8x     |
| sort numeric column               | 62.1 ms | 14.1 ms | 4.4x     |
| sort two columns                  | 64.6 ms | 17.1 ms | 3.8x     |
| filter                            | 5.7 ms  | 1.3 ms  | 4.3x     |
| groupBy ccy, set/clear            | 1.6 ms  | 1.2 ms  | 1.3x     |
| groupBy ccy + exchange, set/clear | 2.2 ms  | 2.0 ms  | 1.1x     |
| scroll, 100 range changes         | 0.82 ms | 0.45 ms | 1.8x     |
| 1000 ticks, random rows           | 1543 ms | 0.35 ms | ~4400x   |
| 1000 ticks, rows in viewport      | 0.63 ms | 0.10 ms | 6.6x     |
| 1000 ticks, sorted column         | 3012 ms | 1.9 ms  | ~1600x   |
| 1000 ticks, filtered column       | 1903 ms | 0.55 ms | ~3400x   |
| 1000 ticks, grouped               | 1205 ms | 0.39 ms | ~3100x   |
| 500 deletes + 500 inserts         | 1628 ms | 0.60 ms | ~2700x   |
| 500 deletes + 500 inserts, sorted | 2564 ms | 1.57 ms | ~1600x   |

Notes:

- The legacy update path finds each row with a linear search, so per-update cost grows with
  table size. The engine uses keyed lookup and sends each changed row once.
- On updates, legacy does not re-sort or re-filter rows. The engine does, so the tick
  comparisons understate the engine's advantage.
- Scrolling: the engine uses an array-backed row key allocator (`RowKeys`) and prunes its row
  cache incrementally, so range changes cost in proportion to the rows entering or leaving the range.

## Tests

```sh
bun test packages/vuu-data-engine-local
```

The tests previously ran under vitest with happy-dom. Under `bun test`, `test/browser-globals.ts`
provides `requestAnimationFrame` and `window`, and `test/happy-dom.ts` registers a DOM for the
React test only.

`test/EngineDataSource.test.ts` holds the conformance tests for the engine-backed data source.
