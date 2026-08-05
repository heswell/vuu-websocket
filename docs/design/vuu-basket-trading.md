# VUU Basket Trading Design

## Overview

`@heswell/vuu-basket-trading` is a standalone Bun and TypeScript VUU server
package that implements the basket-trading data model previously provided by
the UI test `BasketModule`.

The server owns the complete data model under the `BASKET` namespace, including
its price table. It does not depend on `SIMUL` or another application module.

The implementation is located at:

```text
packages/vuu-basket-trading
```

It is started from the repository root with:

```sh
npm run start:basket-trading
```

The script sets `VUU_APP=vuu-basket-trading`, loads the package's
`application.conf`, and starts the standard `VuuServer` lifecycle.

The application exposes:

- the VUU websocket endpoint on port `8093` by default; and
- the Keycloak-backed authentication endpoint at `POST /api/authn` over HTTPS
  on port `8445` by default.

## Package Structure

```text
packages/vuu-basket-trading/
  __tests__/
    BasketModule.test.ts
  application.conf
  package.json
  src/
    BasketTradingMain.ts
    index.ts
    modules/basket/
      BasketModule.ts
      BasketTableDefs.ts
      providers/
        BasketPricesProvider.ts
        InMemoryProvider.ts
      reference-data/
        constituents.ts
        ftse100.ts
        hsi.ts
        nasdaq100.ts
        sp500.ts
      services/
        BasketService.ts
        BasketTradingConstituentService.ts
        BasketTradingService.ts
```

`BasketTradingMain.ts` creates a `KeycloakAuthProvider` and delegates common
server composition to `createVuuServerApplication` from `vuu-server`. That
shared bootstrap configures TLS, websocket and HTTPS ports, the login-token
service, `/api/authn`, modules, and lifecycle startup.

TLS is enabled for basket trading because the VUU REST server serves HTTPS
only. The package uses its checked-in development certificate by default;
deployments must provide their own certificate and key paths.

The public portal client includes `vuu-basket-trading-server` in its token
audience. Basket authentication therefore uses `require-audience` and does not
require token exchange or a checked-in client secret.

## Shared Server Bootstrap

`createVuuServerApplication` centralizes the entrypoint pattern shared by
`vuu-portal`, `vuu-module-discovery`, and `vuu-basket-trading`:

1. create configuration-driven websocket and TLS options;
2. create a lifecycle and login-token service;
3. install the configurable `/api/authn` handler;
4. compose optional application-specific HTTPS handlers;
5. register application modules;
6. construct the `VuuServer`; and
7. install the shutdown hook and start the lifecycle.

Portal supplies its configurable Keycloak/permissive provider. Module discovery
supplies Keycloak plus its `/module-registry` handler. Basket trading supplies
Keycloak and no additional HTTPS handlers, so `/api/authn` is its only HTTPS
application endpoint.

## Module Composition

`BasketModule` uses `ModuleFactory.withNameSpace("BASKET")` to register seven
base tables and one join table:

| Table | Kind | Key |
| --- | --- | --- |
| `algoType` | Base | `id` |
| `basket` | Base | `id` |
| `basketConstituent` | Base | `ricBasketId` |
| `basketTrading` | Base | `instanceId` |
| `basketTradingConstituent` | Base | `instanceIdRic` |
| `prices` | Base | `ric` |
| `priceStrategyType` | Base | `id` |
| `basketTradingConstituentJoin` | Left outer join | `instanceIdRic` |

All table definitions, including column order and VUU data types, are declared
in `BasketTableDefs.ts`.

## Static Data

`InMemoryProvider` loads immutable initial rows for:

- algorithm types;
- basket definitions;
- basket constituents; and
- price strategy types.

The package contains the canonical FTSE 100, Hang Seng, NASDAQ 100, and S&P 500
source datasets copied from the UI test implementation. `constituents.ts`
normalizes those sources into the `basketConstituent` schema.

The resulting constituent table has 318 rows. Its `basketId` column has a
visual link to `basket.id`.

The initial baskets are:

| id | name |
| --- | --- |
| `.NASDAQ100` | `.NASDAQ100` |
| `.HSI` | `.HSI` |
| `.FTSE100` | `.FTSE100` |
| `.SP500` | `.SP500` |

## Price Data

`BasketPricesProvider` creates one deterministic price row for each unique
constituent RIC. Prices are contained in `BASKET.prices`.

The table provides:

```text
ask, askSize, bid, bidSize, close, last, open, phase, ric, scenario
```

Generated rows use stable values based on source order, a two-cent spread,
`CONTINUOUS` phase, and `default` scenario. This provides local price data for
the basket join without requiring the external price service.

## Trading Basket Creation

`BasketService` is installed on the `basket` table viewport. It exposes the
`createBasket` RPC and the `Add Basket` selected-rows menu item.

`createBasket` accepts:

```text
sourceBasketId: string
tradeBasketName: string
```

The operation:

1. validates both parameters and confirms that the source basket exists;
2. allocates a process-unique `steve-<n>` instance ID;
3. constructs a `basketTrading` row using the compatibility defaults;
4. selects every source constituent belonging to the basket;
5. creates one `basketTradingConstituent` row per source constituent; and
6. returns the instance ID in a `SUCCESS_RESULT`.

New trading baskets use:

| Field | Initial value |
| --- | --- |
| `filledPct` | `0` |
| `fxRateToUsd` | `1.25` |
| `side` | `BUY` |
| `status` | `OFF MARKET` |
| `totalNotional` | `1000000` |
| `totalNotionalUsd` | `1250000` |
| `units` | `100` |

Each trading constituent copies its RIC, description, volume, and weighting
from the source row. Its key is `${instanceId}-${ric}`.

The operation prepares all constituent rows before mutation. If an insertion
fails, it deletes any inserted constituents and the trading basket so callers
do not observe partial state.

## Market Status

`BasketTradingService` is installed on `basketTrading` and exposes:

- `sendToMarket`, which sets status to `ON_MARKET`;
- `takeOffMarket`, which sets status to `OFF-MARKET`.

Both RPCs require a valid `basketInstanceId`. Updates use the table's normal
upsert path so active viewports receive row-update events.

The different `OFF MARKET` and `OFF-MARKET` spellings intentionally preserve
the behavior of the source implementation.

## Trading Constituents

`BasketTradingConstituentService` is installed on the mutable
`basketTradingConstituent` base table.

It registers `addConstituent`, but the operation currently returns:

```text
addConstituent not implemented
```

The service is deliberately attached to the base table rather than the join.
When constituent creation is implemented, it will insert into
`basketTradingConstituent`; `JoinTableProvider` will then publish the
corresponding joined row automatically.

## Constituent Price Join

`basketTradingConstituentJoin` is a left outer join:

```text
BASKET.basketTradingConstituent.ric
    -> BASKET.prices.ric
```

The join combines trading controls and execution fields with current price
fields. Its declared output columns preserve the schema expected by basket
trading clients.

The shared in-memory `JoinTable` implementation was corrected as part of this
work to:

1. use the left and right fields declared by `JoinSpec`, rather than assuming
   that the base primary key is also the join key; and
2. construct joined rows in `JoinTableDef.joinColumns` order.

This is required because the base key is `instanceIdRic`, while the price join
key is `ric`.

Base-table inserts already call `JoinTableProvider.sendEvent`. For a left-side
insert, the provider calls `insertKey` on the join table, which publishes the
new joined row to its viewports.

## Shared Table Typing

The `DataTable` interface now declares inherited mutation members used by VUU
services:

```text
delete
indexOfKeyField
insert
upsert
```

`InMemDataTable` already inherited these implementations from `Table`; the
change aligns its public TypeScript interface with its runtime behavior.

## Error Handling

RPC parameters are validated before mutation. Invalid or unknown identifiers
return `ERROR_RESULT` with an explicit message.

`createBasket` rolls back partial inserts. Market-status RPCs reject missing or
unknown basket instances. `addConstituent` reports its unsupported state
explicitly rather than silently succeeding.

## Verification

`BasketModule.test.ts` starts a real in-memory `VuuServer` and verifies:

- all eight tables are registered in the `BASKET` namespace;
- lookup, basket, constituent, and price data load correctly;
- trading basket creation produces the expected basket and constituent rows;
- the constituent join resolves prices through `ric`;
- market status RPCs update rows;
- invalid creation leaves table counts unchanged;
- `addConstituent` is exposed on the base constituent table;
- basket visual-link metadata is present; and
- the `Add Basket` menu has the expected wire representation.

The basket tests are run with the existing VUU server lifecycle tests:

```sh
bun test packages/vuu-basket-trading/__tests__/BasketModule.test.ts \
  packages/vuu-server/__tests__/VuuServer.test.ts
```

## Current Limitations

- Data is in memory and is not persisted across server restarts.
- Price rows are deterministic local fixtures rather than a live market feed.
- `addConstituent` is registered but not implemented.
- No order-management integration or basket-trading UI is included in this
  package.
