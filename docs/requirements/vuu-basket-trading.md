# Requirement: `vuu-basket-trading`

## Background

Create `@heswell/vuu-basket-trading`, a Bun and TypeScript package that runs a
VUU server for basket trading.

The package must reproduce the tables, reference data, visual links, menus, and
RPC behavior of:

`vuu/vuu-ui/packages/vuu-data-test/src/basket/BasketModule.ts`

That implementation is the normative functional contract. `vuu-demo` is the
preferred local model for table definitions, providers, services, joins, and
module wiring. `vuu-module-discovery` and `vuu-portal` are the preferred models
for package layout, exports, application configuration, startup, and tests.

## Package Scope

1. Add package `@heswell/vuu-basket-trading` under
   `packages/vuu-basket-trading`.
2. Use Bun, TypeScript, and ESM.
3. Depend on `@heswell/vuu-server` and only add other runtime dependencies when
   required by the implementation.
4. Export the server entry point from `src/index.ts`.
5. Provide `application.conf` in the package root and load it with
   `ConfigFactory.load()` without an explicit path.
6. Provide a root startup script at `scripts/start-basket-trading.ts`.
7. Add a root `start:basket-trading` script that sets
   `VUU_APP=vuu-basket-trading`.
8. Start and stop through the standard `LifecycleContainer` and `VuuServer`
   lifecycle.
9. Do not add portal, module-discovery, Keycloak administration, or unrelated
   HTTP APIs to this package.

## Server and Module Composition

1. Register a VUU module with namespace `BASKET`.
2. Register every table in this document through `ModuleFactory`.
3. Use dedicated table-definition, provider, and service files rather than
   implementing the module as a single monolithic file.
4. Construct ordinary VUU viewports and services using existing
   `@heswell/vuu-server` primitives.
5. Register the `prices` table in the `BASKET` module so every table used by
   basket trading remains in the same module namespace. Its data contract must
   remain compatible with the existing demo price table.
6. Preserve the table names, column names, column order, data types, keys, and
   module namespace exactly as specified below.

## Table Definitions

### `algoType`

| Column | VUU type |
| --- | --- |
| `algoType` | `string` |
| `id` | `int` |

Key field: `id`.

Initial rows, in column order:

| algoType | id |
| --- | --- |
| `Sniper` | `0` |
| `Dark Liquidity` | `1` |
| `VWAP` | `2` |
| `POV` | `3` |
| `Dynamic Close` | `4` |

### `basket`

| Column | VUU type |
| --- | --- |
| `id` | `string` |
| `name` | `string` |
| `notionalValue` | `double` |
| `notionalValueUsd` | `double` |

Key field: `id`.

Initial rows, in column order:

| id | name | notionalValue | notionalValueUsd |
| --- | --- | --- | --- |
| `.NASDAQ100` | `.NASDAQ100` | `0` | `0` |
| `.HSI` | `.HSI` | `0` | `0` |
| `.FTSE100` | `.FTSE100` | `0` | `0` |
| `.SP500` | `.SP500` | `0` | `0` |

The table viewport must expose the `createBasket` RPC service described below.
It must also expose the basket menu described under Menu Requirements.

### `basketConstituent`

| Column | VUU type |
| --- | --- |
| `basketId` | `string` |
| `change` | `string` |
| `description` | `string` |
| `lastTrade` | `string` |
| `ric` | `string` |
| `ricBasketId` | `string` |
| `side` | `string` |
| `volume` | `string` |
| `weighting` | `double` |

Key field: `ricBasketId`.

The table must contain the same FTSE 100, Hang Seng, NASDAQ 100, and S&P 500
constituent reference rows as the normative `BasketModule` implementation.
Reference data may be copied into this package or generated from equivalent
checked-in source data, but the resulting rows must be identical.

For generated rows:

1. `basketId` identifies one of `.FTSE100`, `.HSI`, `.NASDAQ100`, or `.SP500`.
2. `ricBasketId` is `${ric}-${basketId}`.
3. `side` is `BUY`.
4. FTSE 100 and Hang Seng values preserve their source volume.
5. NASDAQ 100 and S&P 500 volume is `1000`.
6. S&P 500 `lastTrade` is `0`.

Add a visual link from `basketConstituent.basketId` to `basket.id`.

### `basketTrading`

| Column | VUU type |
| --- | --- |
| `basketId` | `string` |
| `basketName` | `string` |
| `filledPct` | `double` |
| `fxRateToUsd` | `double` |
| `instanceId` | `string` |
| `side` | `string` |
| `status` | `string` |
| `totalNotional` | `double` |
| `totalNotionalUsd` | `double` |
| `units` | `int` |

Key field: `instanceId`.

The table starts empty. Its viewport must expose the `sendToMarket` and
`takeOffMarket` RPC services.

### `basketTradingConstituent`

| Column | VUU type |
| --- | --- |
| `algo` | `string` |
| `algoParams` | `string` |
| `basketId` | `string` |
| `description` | `string` |
| `instanceId` | `string` |
| `instanceIdRic` | `string` |
| `limitPrice` | `double` |
| `notionalLocal` | `double` |
| `notionalUsd` | `double` |
| `pctFilled` | `double` |
| `priceSpread` | `int` |
| `priceStrategyId` | `int` |
| `quantity` | `long` |
| `ric` | `string` |
| `side` | `string` |
| `status` | `string` |
| `venue` | `string` |
| `weighting` | `double` |

Key field: `instanceIdRic`.

The table starts empty and receives one row per source basket constituent when
`createBasket` succeeds.

### `prices`

| Column | VUU type |
| --- | --- |
| `ask` | `double` |
| `askSize` | `double` |
| `bid` | `double` |
| `bidSize` | `double` |
| `close` | `double` |
| `last` | `double` |
| `open` | `double` |
| `phase` | `string` |
| `ric` | `string` |
| `scenario` | `string` |

Key field and join field: `ric`.

The table must be registered as `BASKET.prices`, not `SIMUL.prices`. Its
provider behavior and generated price data must remain compatible with the
existing `vuu-demo` price implementation.

### `basketTradingConstituentJoin`

This is a left outer join from `BASKET.basketTradingConstituent` to
`BASKET.prices`, joined on `ric`.

| Column | VUU type |
| --- | --- |
| `algo` | `string` |
| `algoParams` | `string` |
| `ask` | `double` |
| `askSize` | `double` |
| `basketId` | `string` |
| `bid` | `double` |
| `bidSize` | `double` |
| `close` | `double` |
| `description` | `string` |
| `instanceId` | `string` |
| `instanceIdRic` | `string` |
| `last` | `double` |
| `limitPrice` | `double` |
| `notionalLocal` | `double` |
| `notionalUsd` | `double` |
| `open` | `double` |
| `pctFilled` | `double` |
| `phase` | `string` |
| `priceSpread` | `int` |
| `priceStrategyId` | `int` |
| `quantity` | `long` |
| `ric` | `string` |
| `scenario` | `string` |
| `side` | `string` |
| `status` | `string` |
| `venue` | `string` |
| `weighting` | `double` |

Key field: `instanceIdRic`.

Rows inserted into the base table must automatically appear in the join through
the standard `JoinTableProvider` behavior.

### `priceStrategyType`

| Column | VUU type |
| --- | --- |
| `priceStrategy` | `string` |
| `id` | `int` |

The normative test implementation declares an empty key. The server package
must preserve the observable table contract while using a valid VUU server key
configuration; `id` is the expected key if the server requires one.

Initial rows, in column order:

| priceStrategy | id |
| --- | --- |
| `Peg to Near Touch` | `0` |
| `Far Touch` | `1` |
| `Limit` | `2` |
| `Algo` | `3` |

## Provider Requirements

1. Implement a provider boundary for every base table.
2. Providers must populate rows in exactly the table-definition column order.
3. Lookup and reference-data providers must finish loading deterministically.
4. Trading providers must support insert and update publication so active
   viewports receive changes caused by RPC calls.
5. Keep shared basket state consistent across the `basketTrading`,
   `basketTradingConstituent`, and joined viewports.
6. Do not use silent fallback data when reference data cannot be loaded.

## RPC Requirements

All RPCs below accept only `VIEWPORT_CONTEXT`. An incompatible context must
produce an explicit RPC error and must not mutate any table.

### `createBasket`

The `basket` viewport exposes `createBasket` with parameters:

| Parameter | Type | Meaning |
| --- | --- | --- |
| `sourceBasketId` | `string` | ID of the source basket. |
| `tradeBasketName` | `string` | Name of the new trading basket instance. |

Required behavior:

1. Validate that both parameters are present and that `sourceBasketId`
   identifies an existing basket.
2. Generate a unique string `instanceId` compatible with the normative
   `steve-<increment>` format. IDs must not collide within a process.
3. Insert one `basketTrading` row with:

| Column | Value |
| --- | --- |
| `basketId` | `sourceBasketId` |
| `basketName` | `tradeBasketName` |
| `filledPct` | `0` |
| `fxRateToUsd` | `1.25` |
| `instanceId` | generated ID |
| `side` | `BUY` |
| `status` | `OFF MARKET` |
| `totalNotional` | `1000000` |
| `totalNotionalUsd` | `1250000` |
| `units` | `100` |

4. Select every `basketConstituent` row whose `basketId` matches
   `sourceBasketId`.
5. Insert one `basketTradingConstituent` row per selected constituent with:

| Column | Value |
| --- | --- |
| `algo` | empty string |
| `algoParams` | empty string |
| `basketId` | source basket ID |
| `description` | source constituent description |
| `instanceId` | generated basket instance ID |
| `instanceIdRic` | `${instanceId}-${ric}` |
| `limitPrice` | `95` |
| `notionalLocal` | `0` |
| `notionalUsd` | `0` |
| `pctFilled` | `0` |
| `priceSpread` | `0` |
| `priceStrategyId` | the normative empty initial value |
| `quantity` | source constituent volume |
| `ric` | source constituent RIC |
| `side` | `BUY` |
| `status` | empty string |
| `venue` | `venue` |
| `weighting` | source constituent weighting |

6. Return `SUCCESS_RESULT` with the generated `instanceId` as `data`.
7. Do not leave a partially created trading basket if constituent creation
   fails.

### `sendToMarket`

The `basketTrading` viewport exposes `sendToMarket` with string parameter
`basketInstanceId`.

The service must update the matching `basketTrading.status` to `ON_MARKET` and
return `SUCCESS_RESULT` with no data. A missing basket instance must return an
explicit error.

### `takeOffMarket`

The `basketTrading` viewport exposes `takeOffMarket` with string parameter
`basketInstanceId`.

The service must update the matching `basketTrading.status` to `OFF-MARKET` and
return `SUCCESS_RESULT` with no data. The hyphenated value is required for
compatibility even though newly created baskets use `OFF MARKET`. A missing
basket instance must return an explicit error.

### `addConstituent`

The `basketTradingConstituent` viewport must register `addConstituent`. The
service belongs to the mutable base table, not
`basketTradingConstituentJoin`. A successful future implementation will insert
into `basketTradingConstituent`, allowing `JoinTableProvider` to publish the
corresponding joined row automatically.
The normative implementation currently throws `addConstituent not implemented`;
this package must return an explicit not-implemented RPC error and must not
mutate tables. Implementing constituent addition is outside this requirement.

## Menu Requirements

The `basket` table must expose a root menu containing:

| Property | Value |
| --- | --- |
| `name` | `Add Basket` |
| `context` | `selected-rows` |
| `filter` | empty string |
| `rpcName` | `CREATE_NEW_BASKET` |

Preserve the menu RPC name independently from the viewport service name
`createBasket`, matching the normative module.

## Configuration Requirements

1. Configure websocket URI and port through `application.conf`, following the
   current package conventions.
2. Support optional TLS using configured certificate and key paths.
3. Do not hard-code deployment ports or certificate paths in TypeScript.
4. Use a basket-trading-specific default websocket port that does not conflict
   with the repository's existing demo, portal, or module-discovery defaults.
5. Ensure `VUU_APP=vuu-basket-trading` selects this package's configuration.

## Suggested Project Structure

```text
packages/vuu-basket-trading/
  application.conf
  package.json
  src/
    BasketTradingMain.ts
    index.ts
    modules/
      basket/
        BasketModule.ts
        BasketTableDefs.ts
        index.ts
        providers/
        reference-data/
        services/
scripts/
  start-basket-trading.ts
```

Exact provider and service filenames may follow the repository's established
naming conventions.

## Testing Requirements

Focused tests must cover:

1. all eight table schemas, including column order, types, and keys;
2. initial basket, algorithm, price-strategy, and constituent data;
3. creation of a trading basket and all of its constituent rows;
4. unique instance IDs across multiple creations;
5. `sendToMarket` and `takeOffMarket` status updates;
6. propagation of mutations to active viewports;
7. the constituent-to-price left outer join;
8. basket visual-link and menu metadata;
9. invalid RPC context and parameters;
10. no partial state after failed basket creation; and
11. explicit not-implemented behavior for `addConstituent`.

## Acceptance Criteria

1. `npm run start:basket-trading` starts the package through the standard VUU
   lifecycle using configuration selected by `VUU_APP`.
2. The server registers the `BASKET` module and every table specified above.
3. Table schemas and initial rows match the normative `BasketModule`.
4. The constituent join exposes compatible `BASKET.prices` data by `ric`, and
   has no dependency on tables in the `SIMUL` namespace.
5. `createBasket` inserts the expected trading-basket row and exactly one
   trading constituent for every source constituent.
6. The created `instanceId` is returned to the client and all generated
   `instanceIdRic` values use it.
7. `sendToMarket` and `takeOffMarket` publish the required status values.
8. The basket menu and basket-constituent visual link are exposed.
9. Invalid requests fail explicitly without partial or silent mutations.
10. Existing packages and server behavior remain unchanged.

## Non-Goals

1. Building a basket-trading web UI.
2. Changing the normative table contract or reference data.
3. Implementing `addConstituent`.
4. Adding order-management or execution behavior beyond the three implemented
   basket RPCs.
5. Adding persistence, external databases, authentication, or authorization.
6. Refactoring unrelated `vuu-server`, `vuu-demo`, `vuu-portal`, or
   `vuu-module-discovery` behavior.
