# Benchmark results: 1000000 rows

Bun 1.3.14, darwin/arm64, median of 3 iterations (+1 warmup).

| Scenario | vuu-viewport (ms) | check |
| --- | --- | --- |
| build table (1000000 inserts) | 195 | 1000000 |
| create view, natural order | 5.66 | 1000000 |
| create view, sort price | 275 | 1000000 |
| create view, sort ccy+price | 393 | 1000000 |
| create view, filter ccy=EUR & price>500 | 12.9 | 62134 |
| create view, filter in + sort | 120 | 374578 |
| re-sort price -> ccy+price | 378 | 1000000 |
| apply filter to sorted view | 136 | 374578 |
| narrow filter (in -> in & price>500) | 91.5 | 187324 |
| scroll 500 x setRange (sorted) | 5.99 | 1000000 |
| 20000 ticks, non-sort column (sorted view) | 8.28 | 1000000 |
| 2000 ticks, sort column (sorted view) | 17.1 | 1000000 |
| 2000 ticks, filter column (filtered+sorted) | 7.64 | 374655 |
| 1000 inserts (filtered+sorted) | 2.19 | 374954 |
| 1000 deletes (sorted) | 9.62 | 999000 |
| create view, groupBy ccy,exchange + aggs | 29.2 | 8 |
| groupBy existing view | 27.1 | 8 |
| grouped: expand all ccy nodes | 0.13 | 56 |
| 20000 ticks, aggregated column (grouped) | 16.6 | 8 |
