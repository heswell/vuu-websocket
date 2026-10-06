# `@heswell/vuu-table`

Runtime-agnostic Vuu table store. It runs unchanged in the browser or on a
server (Bun, Node), and is the data layer under `@heswell/vuu-viewport`.

| Export                                          | Use                                                                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Table`                                         | Keyed row store built from a Vuu `TableSchema`: insert, upsert, update, delete, with row created/updated timestamps. Notifies listeners of every change. |
| `JoinTable`                                     | A materialized join of two tables (left outer by default, or `joinType: "inner"`). Joins can be chained.                                                 |
| `RowSource`, `TableListener`, `VuuDataRow`, ... | The types an engine uses to consume a table.                                                                                                             |

```ts
import { Table } from "@heswell/vuu-table";

const prices = new Table({
  table: { module: "SIMUL", table: "prices" },
  key: "ric",
  columns: [
    { name: "ric", serverDataType: "string" },
    { name: "bid", serverDataType: "double" },
  ],
});
prices.upsert(["VOD.L", 101.5]);
```

Peer dependencies: `@vuu-ui/vuu-data-types` and `@vuu-ui/vuu-protocol-types`
(type-only). See
[docs/design/data-engine.md](https://github.com/heswell/vuu-websocket/blob/main/docs/design/data-engine.md)
for the design.

## Publishing

```sh
npm run build:packages -- --package @heswell/vuu-table
npm run pub -- --package=@heswell/vuu-table --dry-run
npm run pub -- --package=@heswell/vuu-table [--tag alpha]
```

The build is written to `dist/vuu-table`. Publish `@heswell/vuu-table` before
`@heswell/vuu-viewport`, which depends on it.
