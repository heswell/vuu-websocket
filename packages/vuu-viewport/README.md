# `@heswell/vuu-viewport`

Runtime-agnostic Vuu viewport analytics engine over `@heswell/vuu-table`:
windowing, sorting, filtering, grouping with aggregation, selection (including
select-all) and visual linking. It runs unchanged in the browser or on a
server, and produces rows in the Vuu protocol format.

| Export                                      | Use                                                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `InMemoryViewport`                          | One viewport over a table: range, sort, filter, base filter, group by, tree open/close, selection, visual link filter. |
| `inMemoryDataEngine`                        | Factory implementing the `DataEngine` contract, so an alternative engine can be swapped in.                            |
| `GroupTree`, filter, sort and value helpers | Building blocks used by the viewport.                                                                                  |

```ts
import { Table } from "@heswell/vuu-table";
import { InMemoryViewport } from "@heswell/vuu-viewport";

const viewport = new InMemoryViewport(prices, {
  id: "vp-1",
  columns: ["ric", "bid"],
  range: { from: 0, to: 50 },
  sort: { sortDefs: [{ column: "bid", sortType: "D" }] },
  filterSpec: { filter: 'ric starts "V"' },
});
const { rows, size } = viewport.getCurrentRange();
```

Peer dependencies: `@vuu-ui/vuu-filter-parser`, plus the type-only
`@vuu-ui/vuu-data-types`, `@vuu-ui/vuu-filter-types` and
`@vuu-ui/vuu-protocol-types`. See
[docs/design/data-engine.md](https://github.com/heswell/vuu-websocket/blob/main/docs/design/data-engine.md)
and
[docs/design/data-engine-internals.md](https://github.com/heswell/vuu-websocket/blob/main/docs/design/data-engine-internals.md).

## Publishing

```sh
npm run build:packages -- --package @heswell/vuu-viewport
npm run pub -- --package=@heswell/vuu-viewport --dry-run
npm run pub -- --package=@heswell/vuu-viewport [--tag alpha]
```

The build is written to `dist/vuu-viewport`. Publish `@heswell/vuu-table`
first.
