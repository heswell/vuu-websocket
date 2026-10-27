# Migrating from `@vuu-ui/vuu-data-test`

`@heswell/vuu-data-engine-local` replaces the `VuuModule` / `TickingArrayDataSource`
core of `@vuu-ui/vuu-data-test` with the Vuu data engine (`@heswell/vuu-table` and
`@heswell/vuu-viewport`), the same engine the vuu-websocket server runs. Your modules
and the components that use them stay largely as they are. What changes is how modules
are registered and how the data provider is installed.

## 1. Install

```sh
npm install @heswell/vuu-data-engine-local
```

All `@vuu-ui/*` packages and `react` are peer dependencies, so the engine uses your
app's single copy of each. You can remove `@vuu-ui/vuu-data-test` once nothing imports
it.

## 2. Choose a migration path

### a) No code changes: alias the package

If your app uses the demo modules (`simulModule`, `basketModule`, `testModule`, …)
imported from `@vuu-ui/vuu-data-test`, point that import at the `/legacy` entry in your
bundler config:

```ts
// rsbuild / vite
resolve: {
  alias: {
    "@vuu-ui/vuu-data-test": "@heswell/vuu-data-engine-local/legacy",
  },
},
```

`/legacy` behaves like vuu-data-test: importing it creates the demo modules and
registers them with a shared default engine, and it exports `LocalDataSourceProvider`.
The vuu showcase uses this route (`npm run showcase:engine`). It's the quickest way to
try the engine, but the long-term route is (b).

### b) Recommended: explicit engines

Create an engine with your modules, and install its data provider.

**Portal / `AuthenticationProvider mode="local"`**: `createLocalVuuServer` returns
the `LocalVuuServer` that `localServers` expects. A module whose `connectionId`
matches gets this server's data context instead of a websocket.

```tsx
import { createLocalVuuServer } from "@heswell/vuu-data-engine-local/react";

const ordersServer = createLocalVuuServer({
  connectionId: "orders",
  modules: [new OrdersModule()],
});

<AuthenticationProvider mode="local" localServers={[ordersServer]}>
  <App />
</AuthenticationProvider>;
```

**Standalone app or story**: replace vuu-data-test's `LocalDataSourceProvider` with the
engine's provider.

```tsx
import { createLocalEngine, registerDemoModules } from "@heswell/vuu-data-engine-local";
import { createDataSourceProvider } from "@heswell/vuu-data-engine-local/react";

const engine = createLocalEngine({ modules: [new OrdersModule()] });
registerDemoModules(engine); // only if you use SIMUL, BASKET or TEST
const DataSourceProvider = createDataSourceProvider(engine);

<DataSourceProvider>
  <App />
</DataSourceProvider>;
```

The provider installs both the `@vuu-ui/vuu-utils` and the `@vuu-ui/core` data
contexts, so `useData()`, `VuuDataSource` and `getServerAPI` work as before.

## 3. Update imports

| vuu-data-test                                  | vuu-data-engine-local                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `VuuModule`, `Table`, `buildDataColumnMapFromSchema`, schemas, `makeSuggestions` | Same names, from `@heswell/vuu-data-engine-local`                       |
| `TickingArrayDataSource`                       | `ModuleDataSource` (`TickingArrayDataSource` remains as a deprecated alias)              |
| `LocalDataSourceProvider`, `createLocalVuuServer` | `@heswell/vuu-data-engine-local/react`; `createLocalVuuServer` creates a new engine per server |
| `simulModule`, `basketModule`, `testModule`, … | `registerDemoModules(engine)`, or import them from `/legacy`                             |
| `tableContainer` (global, keyed by table name) | `engine.tableContainer`, keyed by `{module, table}`                                       |
| `instrumentsTable`, `pricesTable`, `instrumentsData`, … (created on import) | Lazy getters and factories such as `getInstrumentsData()` and `createPricesTable()` |
| `PermissionFilteredTable`                      | Removed: use the module's `permissionFunctions` (applied by the engine as a filter)      |

The main entry has no DOM dependency, so it runs in Node or Bun tests with no shims.
The React bindings live in `/react` because `@vuu-ui/core` needs a DOM at import time.

## 4. Update your modules

A `VuuModule` subclass keeps the same shape: `schemas`, `tables`, `services`,
`menuServices`, `menus`, `visualLinks` and `permissionFunctions`. Change two things:

- **Register modules explicitly.** `new OrdersModule()` no longer registers itself.
  Pass modules to `createLocalEngine({ modules })` or `createLocalVuuServer`, or call
  `engine.register(module)`.
- **Ticking data starts on demand.** Generators start when the first data source is
  created and stop on `engine.dispose()`. Call `dispose()` in test teardown or when a
  local server is no longer needed.

You can also customise edit sessions per table with `editHooks` (for example
`canSaveSession` or `applySessionSave`), and override built-in RPC services by
`rpcName` with `moduleServices` or table `services`. See the README.

## 5. Behaviour differences to check

- **Edit sessions follow vuu-server.** `deleteRow` only works inside an edit session,
  and marks the row for deletion on save. `editCell` refuses the key and system
  columns. `endEditSession` fails with `"stale update"` or `"duplicate key"` unless
  `force` is set. The engine checks keys and stale rows strictly, so tests that relied
  on direct deletes or unchecked saves need updating.
- **Visual links filter in the engine,** not on the client.
- **Grouped rows** are only available from `getRowAtIndex` inside the client range.
  Flat rows are available at any index.
- **Inserting an existing key** updates that row instead of adding a duplicate. Table
  keys must not be empty.
- **Ticks re-sort and re-filter.** The engine keeps sort, filter, groupBy and
  aggregates correct as rows change; vuu-data-test does not. Tests that asserted
  stale ordering after an update need updating.
- **Aggregations are computed in full.** Every aggregation in the list is computed,
  changing the list clears values from the previous one, and `aggregations = []` works
  on a grouped data source. In vuu-data-test, setting several aggregations at once
  filled in only some of them, previous values were left behind, and `[]` throws.
- **Closing a group collapses the groups inside it.** When you reopen it, its child
  groups start collapsed.

## 6. Performance

The engine is faster on almost every operation, and the difference grows with table
size. The biggest gains are on updates, because vuu-data-test finds each updated row
with a linear search. At 100k rows, ticks and churn are about 1,000x to 4,000x faster,
expanding or collapsing a group takes well under a millisecond instead of nearly two
seconds, and sort, filter and create are 3x to 5x faster. Changing
aggregations and grouping are about the same speed, or slightly slower. See the
README's Performance section for the full tables and the 1M-row results.
