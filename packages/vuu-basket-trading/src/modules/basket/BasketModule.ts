import {
  Join,
  JoinSpec,
  JoinTableDef,
  ModuleFactory,
  VisualLinks,
  ViewPortDef,
  type Column,
  type DataTable,
} from "@heswell/vuu-server";
import {
  algoType,
  basket,
  basketConstituent,
  basketTrading,
  basketTradingConstituent,
  basketTradingConstituentJoinColumns,
  prices,
  priceStrategyType,
} from "./BasketTableDefs";
import constituentRows from "./reference-data/constituents";
import { BasketPricesProvider } from "./providers/BasketPricesProvider";
import { InMemoryProvider } from "./providers/InMemoryProvider";
import { BasketService } from "./services/BasketService";
import { BasketTradingConstituentService } from "./services/BasketTradingConstituentService";
import { BasketTradingService } from "./services/BasketTradingService";

const algoRows = [
  ["Sniper", 0],
  ["Dark Liquidity", 1],
  ["VWAP", 2],
  ["POV", 3],
  ["Dynamic Close", 4],
];

const basketRows = [
  [".NASDAQ100", ".NASDAQ100", 0, 0],
  [".HSI", ".HSI", 0, 0],
  [".FTSE100", ".FTSE100", 0, 0],
  [".SP500", ".SP500", 0, 0],
];

const priceStrategyRows = [
  ["Peg to Near Touch", 0],
  ["Far Touch", 1],
  ["Limit", 2],
  ["Algo", 3],
];

const viewportColumns = (columns: Column[]) => columns;

export const BasketModule = () =>
  ModuleFactory.withNameSpace("BASKET")
    .addTable(
      algoType,
      (table) => new InMemoryProvider(table, algoRows),
    )
    .addTable(
      basket,
      (table) => new InMemoryProvider(table, basketRows),
      (table, _provider, _providerContainer, tableContainer) =>
        ViewPortDef(
          viewportColumns(table.tableDef.columns),
          new BasketService(
            table,
            tableContainer.getTable<DataTable>("basketTrading"),
            tableContainer.getTable<DataTable>("basketConstituent"),
            tableContainer.getTable<DataTable>("basketTradingConstituent"),
            tableContainer,
          ),
        ),
    )
    .addTable(
      basketConstituent,
      (table) => new InMemoryProvider(table, constituentRows),
    )
    .addTable(
      basketTrading,
      (table) => new InMemoryProvider(table, []),
      (table, _provider, _providerContainer, tableContainer) =>
        ViewPortDef(
          viewportColumns(table.tableDef.columns),
          new BasketTradingService(table, tableContainer),
        ),
    )
    .addTable(
      basketTradingConstituent,
      (table) => new InMemoryProvider(table, []),
      (table, _provider, _providerContainer, tableContainer) =>
        ViewPortDef(
          viewportColumns(table.tableDef.columns),
          new BasketTradingConstituentService(tableContainer),
        ),
    )
    .addTable(
      prices,
      (table) => new BasketPricesProvider(table, constituentRows),
    )
    .addTable(
      priceStrategyType,
      (table) => new InMemoryProvider(table, priceStrategyRows),
    )
    .addJoinTable((tableDefs) =>
      JoinTableDef({
        name: "basketTradingConstituentJoin",
        baseTable: tableDefs.get("BASKET", "basketTradingConstituent"),
        joinColumns: basketTradingConstituentJoinColumns(
          tableDefs.get("BASKET", "basketTradingConstituent").columns,
          tableDefs.get("BASKET", "prices").columns,
        ),
        joins: Join(
          tableDefs.get("BASKET", "prices"),
          JoinSpec("ric", "ric", "LeftOuterJoin"),
        ),
        links: VisualLinks(),
      }),
    )
    .asModule();
