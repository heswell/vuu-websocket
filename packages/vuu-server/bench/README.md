# vuu-server outbound pipeline benchmark

Measures the server path from table updates to serialized websocket messages:

```
table.update -> flushViewports -> Viewport.post -> OutboundRowPublishQueue
  -> DefaultMessageHandler.sendUpdates (format + JSON.stringify)
```

```sh
bun run bench:outbound [--rows=100000] [--iterations=5] [--filter=<scenario>]
```

The production runner sends one batch (max 300 rows) per session every 60ms.
The benchmark drains the queue after each cycle so CPU cost is measured.

## Results (100k rows, 10 columns, 100-row viewport, Bun 1.3.14, Apple silicon)

Before: rows queued as class instances, a `performance.now()` call per row,
no merging of pending updates. After: pending updates for the same viewport
row are merged in the queue, rows formatted as plain object literals with one
timestamp per batch.

| scenario | before ms | after ms | rows sent before | rows sent after |
|---|---:|---:|---:|---:|
| tick 100 in-viewport rows, 1 flush per send (x100) | 7.89 | 5.82 | 10000 | 10000 |
| tick 100 in-viewport rows, 10 flushes per send (x10) | 7.65 | 1.51 | 10000 | 1000 |
| 20 sessions, tick 1000 random + 20 visible rows (x20) | 17.50 | 15.52 | 7620 | 7620 |
| sorted by price, tick 1000 random rows (x20) | 15.64 | 16.15 | 1059 | 1059 |
| grouped by ccy,trader, tick 1000 random rows (x20) | 2.67 | 2.66 | 0 | 0 |
| scroll 100-row window x100 | 8.20 | 6.12 | 10000 | 10000 |

After these changes JSON serialization and GC account for ~60% of the
single-viewport tick profile; the viewport engine is ~10%.
