window.BENCHMARK_DATA = {
  "lastUpdate": 1792771086714,
  "repoUrl": "https://github.com/heswell/vuu-websocket",
  "entries": {
    "Vuu performance": [
      {
        "commit": {
          "author": {
            "email": "steve@heswell.com",
            "name": "heswell",
            "username": "heswell"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1d7e21bb2490fdac65dba2c8f6ac2527bd1fed9f",
          "message": "Merge pull request #101 from heswell/heswell-copilot-performance-history\n\nTrack CI performance history on GitHub Pages",
          "timestamp": "2026-10-23T16:51:49+01:00",
          "tree_id": "5eef07fd67183b0ba0b133b1205c13969cf10076",
          "url": "https://github.com/heswell/vuu-websocket/commit/1d7e21bb2490fdac65dba2c8f6ac2527bd1fed9f"
        },
        "date": 1792771086410,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "publisher.snapshot.time",
            "value": 148.5,
            "unit": "ms",
            "extra": "time to receive a 200000 row snapshot\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "publisher.snapshot.messages",
            "value": 201,
            "unit": "msgs",
            "extra": "websocket messages for the snapshot\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "publisher.snapshot.bytesPerRow",
            "value": 64.4,
            "unit": "B",
            "extra": "snapshot bytes per row\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "subscription.replicate.time",
            "value": 244.4,
            "unit": "ms",
            "extra": "time to replicate 200000 rows into a local table\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "publisher.ingest.timePer100k",
            "value": 36.7,
            "unit": "ms",
            "extra": "table mutation cost with a live subscriber\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "publisher.flush.time",
            "value": 8,
            "unit": "ms",
            "extra": "flush (serialize + send) after 200000 updates\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "publisher.updates.rowsSent",
            "value": 20000,
            "unit": "rows",
            "extra": "rows sent for 200000 updates to 20000 rows\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "publisher.updates.bytesPerRow",
            "value": 73.6,
            "unit": "B",
            "extra": "live update bytes per row\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "publisher.fanout.flushTime",
            "value": 7.2,
            "unit": "ms",
            "extra": "flush 20000 updated rows to 50 subscribers\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "publisher.fanout.serializations",
            "value": 4,
            "unit": "msgs",
            "extra": "distinct messages serialized for the fan out\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "publisher.idle.ingestTimePer100k",
            "value": 25.1,
            "unit": "ms",
            "extra": "table mutation cost with no subscribers\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "publisher.idle.backlogRows",
            "value": 0,
            "unit": "rows",
            "extra": "update rows replayed to a late subscriber\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "refdata.load.time",
            "value": 537.6,
            "unit": "ms",
            "extra": "load 228488 instruments from ndjson\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "refdata.snapshot.time",
            "value": 256.8,
            "unit": "ms",
            "extra": "time to receive the instruments snapshot\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "refdata.snapshot.messages",
            "value": 230,
            "unit": "msgs",
            "extra": "websocket messages for the instruments snapshot\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "refdata.snapshot.bytesPerRow",
            "value": 98,
            "unit": "B",
            "extra": "instruments snapshot bytes per row\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "prices.startToSnapshot.time",
            "value": 668,
            "unit": "ms",
            "extra": "price service start to subscriber holding the full prices snapshot\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "prices.snapshot.bytesPerRow",
            "value": 69.7,
            "unit": "B",
            "extra": "prices snapshot bytes per row\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "prices.generate.time",
            "value": 69.4,
            "unit": "ms",
            "extra": "generate 100000 price updates\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "prices.flush.time",
            "value": 68.3,
            "unit": "ms",
            "extra": "flush after 100000 price updates\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "prices.updates.bytesPerRow",
            "value": 70.2,
            "unit": "B",
            "extra": "live price update bytes per row\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "orders.startToSnapshot.time",
            "value": 256.3,
            "unit": "ms",
            "extra": "orders service start to subscriber holding 10000 orders\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "orders.snapshot.bytesPerRow",
            "value": 173.4,
            "unit": "B",
            "extra": "orders snapshot bytes per row\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "orders.create.time",
            "value": 12.7,
            "unit": "ms",
            "extra": "create 10000 orders\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "compressed.refdata.snapshot.time",
            "value": 705.5,
            "unit": "ms",
            "extra": "time to receive the compressed instruments snapshot\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "compressed.refdata.snapshot.wireBytesPerRow",
            "value": 14.1,
            "unit": "B",
            "extra": "compressed instruments snapshot wire bytes per row\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "compressed.prices.snapshot.wireBytesPerRow",
            "value": 18.7,
            "unit": "B",
            "extra": "compressed prices snapshot wire bytes per row\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "compressed.prices.flush.time",
            "value": 26.2,
            "unit": "ms",
            "extra": "flush 10000 price updates with compression\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "compressed.prices.updates.wireBytesPerRow",
            "value": 20.7,
            "unit": "B",
            "extra": "compressed live price update wire bytes per row\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.tick 100 in-viewport rows, 1 flush per send (x100).time",
            "value": 9.357995999999986,
            "unit": "ms",
            "extra": "tick 100 in-viewport rows, 1 flush per send (x100), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.tick 100 in-viewport rows, 1 flush per send (x100).messages",
            "value": 100,
            "unit": "msgs",
            "extra": "tick 100 in-viewport rows, 1 flush per send (x100), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.tick 100 in-viewport rows, 1 flush per send (x100).rows",
            "value": 10000,
            "unit": "rows",
            "extra": "tick 100 in-viewport rows, 1 flush per send (x100), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.tick 100 in-viewport rows, 1 flush per send (x100).bytes",
            "value": 2831716,
            "unit": "B",
            "extra": "tick 100 in-viewport rows, 1 flush per send (x100), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.tick 100 in-viewport rows, 10 flushes per send (x10).time",
            "value": 2.9934709999999995,
            "unit": "ms",
            "extra": "tick 100 in-viewport rows, 10 flushes per send (x10), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.tick 100 in-viewport rows, 10 flushes per send (x10).messages",
            "value": 10,
            "unit": "msgs",
            "extra": "tick 100 in-viewport rows, 10 flushes per send (x10), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.tick 100 in-viewport rows, 10 flushes per send (x10).rows",
            "value": 1000,
            "unit": "rows",
            "extra": "tick 100 in-viewport rows, 10 flushes per send (x10), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.tick 100 in-viewport rows, 10 flushes per send (x10).bytes",
            "value": 283209,
            "unit": "B",
            "extra": "tick 100 in-viewport rows, 10 flushes per send (x10), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.20 sessions, tick 1000 random + 20 visible rows (x20).time",
            "value": 28.590025999999966,
            "unit": "ms",
            "extra": "20 sessions, tick 1000 random + 20 visible rows (x20), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.20 sessions, tick 1000 random + 20 visible rows (x20).messages",
            "value": 400,
            "unit": "msgs",
            "extra": "20 sessions, tick 1000 random + 20 visible rows (x20), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.20 sessions, tick 1000 random + 20 visible rows (x20).rows",
            "value": 7620,
            "unit": "rows",
            "extra": "20 sessions, tick 1000 random + 20 visible rows (x20), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.20 sessions, tick 1000 random + 20 visible rows (x20).bytes",
            "value": 2210904,
            "unit": "B",
            "extra": "20 sessions, tick 1000 random + 20 visible rows (x20), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.sorted by price, tick 1000 random rows (x20).time",
            "value": 48.17855099999997,
            "unit": "ms",
            "extra": "sorted by price, tick 1000 random rows (x20), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.sorted by price, tick 1000 random rows (x20).messages",
            "value": 19,
            "unit": "msgs",
            "extra": "sorted by price, tick 1000 random rows (x20), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.sorted by price, tick 1000 random rows (x20).rows",
            "value": 1059,
            "unit": "rows",
            "extra": "sorted by price, tick 1000 random rows (x20), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.sorted by price, tick 1000 random rows (x20).bytes",
            "value": 302184,
            "unit": "B",
            "extra": "sorted by price, tick 1000 random rows (x20), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.grouped by ccy,trader, tick 1000 random rows (x20).time",
            "value": 7.167057999999997,
            "unit": "ms",
            "extra": "grouped by ccy,trader, tick 1000 random rows (x20), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.grouped by ccy,trader, tick 1000 random rows (x20).messages",
            "value": 0,
            "unit": "msgs",
            "extra": "grouped by ccy,trader, tick 1000 random rows (x20), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.grouped by ccy,trader, tick 1000 random rows (x20).rows",
            "value": 0,
            "unit": "rows",
            "extra": "grouped by ccy,trader, tick 1000 random rows (x20), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.grouped by ccy,trader, tick 1000 random rows (x20).bytes",
            "value": 0,
            "unit": "B",
            "extra": "grouped by ccy,trader, tick 1000 random rows (x20), 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.scroll 100-row window x100.time",
            "value": 11.038812999999891,
            "unit": "ms",
            "extra": "scroll 100-row window x100, 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.scroll 100-row window x100.messages",
            "value": 100,
            "unit": "msgs",
            "extra": "scroll 100-row window x100, 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.scroll 100-row window x100.rows",
            "value": 10000,
            "unit": "rows",
            "extra": "scroll 100-row window x100, 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "outbound.100000.scroll 100-row window x100.bytes",
            "value": 2868681,
            "unit": "B",
            "extra": "scroll 100-row window x100, 100000 table rows, 5 iterations (+1 warmup)\nBun 1.3.14, linux-x64, AMD EPYC 7763 64-Core Processor\nTiming samples: 5 where supported\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > create + subscribe (100000 rows) / legacy TickingArrayDataSource",
            "value": 58.430310499999905,
            "range": "27.43% RME",
            "unit": "ms",
            "extra": "Mean of 10 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > create + subscribe (100000 rows) / engine ModuleDataSource",
            "value": 19.261969153846273,
            "range": "4.56% RME",
            "unit": "ms",
            "extra": "Mean of 26 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > sort numeric column, toggle asc/desc (100000 rows) / legacy TickingArrayDataSource",
            "value": 119.86266480000003,
            "range": "11.65% RME",
            "unit": "ms",
            "extra": "Mean of 10 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > sort numeric column, toggle asc/desc (100000 rows) / engine ModuleDataSource",
            "value": 27.2057097368422,
            "range": "4.53% RME",
            "unit": "ms",
            "extra": "Mean of 19 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > sort two columns (100000 rows) / legacy TickingArrayDataSource",
            "value": 112.43761050000049,
            "range": "7.40% RME",
            "unit": "ms",
            "extra": "Mean of 10 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > sort two columns (100000 rows) / engine ModuleDataSource",
            "value": 38.11033850000006,
            "range": "7.77% RME",
            "unit": "ms",
            "extra": "Mean of 14 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > filter, alternating (100000 rows) / legacy TickingArrayDataSource",
            "value": 12.228487731707258,
            "range": "11.13% RME",
            "unit": "ms",
            "extra": "Mean of 41 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > filter, alternating (100000 rows) / engine ModuleDataSource",
            "value": 2.2707414660633574,
            "range": "3.13% RME",
            "unit": "ms",
            "extra": "Mean of 221 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > groupBy ccy, set/clear (100000 rows) / legacy TickingArrayDataSource",
            "value": 1.8608440111524283,
            "range": "13.21% RME",
            "unit": "ms",
            "extra": "Mean of 269 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > groupBy ccy, set/clear (100000 rows) / engine ModuleDataSource",
            "value": 1.8988759056603433,
            "range": "12.69% RME",
            "unit": "ms",
            "extra": "Mean of 265 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > groupBy ccy + exchange, set/clear (100000 rows) / legacy TickingArrayDataSource",
            "value": 3.2806850261438183,
            "range": "16.94% RME",
            "unit": "ms",
            "extra": "Mean of 153 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > groupBy ccy + exchange, set/clear (100000 rows) / engine ModuleDataSource",
            "value": 3.3878068859061106,
            "range": "16.86% RME",
            "unit": "ms",
            "extra": "Mean of 149 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > scroll, 100 range changes (100000 rows) / legacy TickingArrayDataSource",
            "value": 1.224621789731027,
            "range": "6.27% RME",
            "unit": "ms",
            "extra": "Mean of 409 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > scroll, 100 range changes (100000 rows) / engine ModuleDataSource",
            "value": 0.752108263157884,
            "range": "3.06% RME",
            "unit": "ms",
            "extra": "Mean of 665 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > ticks, 1000 updates to random rows (100000 rows) / legacy TickingArrayDataSource",
            "value": 2871.8148477,
            "range": "15.56% RME",
            "unit": "ms",
            "extra": "Mean of 10 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > ticks, 1000 updates to random rows (100000 rows) / engine ModuleDataSource",
            "value": 0.7437823254086702,
            "range": "10.29% RME",
            "unit": "ms",
            "extra": "Mean of 673 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > ticks, 1000 updates to rows in viewport (100000 rows) / legacy TickingArrayDataSource",
            "value": 1.2521726200000558,
            "range": "13.04% RME",
            "unit": "ms",
            "extra": "Mean of 400 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > ticks, 1000 updates to rows in viewport (100000 rows) / engine ModuleDataSource",
            "value": 0.12663405089890648,
            "range": "3.15% RME",
            "unit": "ms",
            "extra": "Mean of 3949 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > ticks, 1000 updates on sorted column (100000 rows) / legacy TickingArrayDataSource",
            "value": 5420.746458599999,
            "range": "7.74% RME",
            "unit": "ms",
            "extra": "Mean of 10 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > ticks, 1000 updates on sorted column (100000 rows) / engine ModuleDataSource",
            "value": 4.521937531528959,
            "range": "5.57% RME",
            "unit": "ms",
            "extra": "Mean of 111 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > ticks, 1000 updates on filtered column (100000 rows) / legacy TickingArrayDataSource",
            "value": 2500.495373899999,
            "range": "8.47% RME",
            "unit": "ms",
            "extra": "Mean of 10 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > ticks, 1000 updates on filtered column (100000 rows) / engine ModuleDataSource",
            "value": 0.8029483723908534,
            "range": "10.70% RME",
            "unit": "ms",
            "extra": "Mean of 623 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > ticks, 1000 updates while grouped (100000 rows) / legacy TickingArrayDataSource",
            "value": 2405.9305566000025,
            "range": "6.12% RME",
            "unit": "ms",
            "extra": "Mean of 10 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > ticks, 1000 updates while grouped (100000 rows) / engine ModuleDataSource",
            "value": 0.4952765940594899,
            "range": "11.33% RME",
            "unit": "ms",
            "extra": "Mean of 1010 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > churn, 500 deletes + 500 inserts (100000 rows) / legacy TickingArrayDataSource",
            "value": 1989.864315499994,
            "range": "1.73% RME",
            "unit": "ms",
            "extra": "Mean of 10 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > churn, 500 deletes + 500 inserts (100000 rows) / engine ModuleDataSource",
            "value": 0.8740269005235937,
            "range": "6.62% RME",
            "unit": "ms",
            "extra": "Mean of 573 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > churn on sorted view, 500 deletes + 500 inserts (100000 rows) / legacy TickingArrayDataSource",
            "value": 3551.601205300004,
            "range": "1.09% RME",
            "unit": "ms",
            "extra": "Mean of 10 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          },
          {
            "name": "local.bench/datasource.bench.ts > churn on sorted view, 500 deletes + 500 inserts (100000 rows) / engine ModuleDataSource",
            "value": 2.902072526010176,
            "range": "6.96% RME",
            "unit": "ms",
            "extra": "Mean of 173 samples, Node v24.16.0\nlinux-x64, AMD EPYC 7763 64-Core Processor\nhttps://github.com/heswell/vuu-websocket/actions/runs/39981909790"
          }
        ]
      }
    ]
  }
}