import {
  Link,
  TableDef,
  VisualLinks,
  type Column,
} from "@heswell/vuu-server";

export const algoType = TableDef({
  columns: [
    { name: "algoType", dataType: "string" },
    { name: "id", dataType: "int" },
  ],
  keyField: "id",
  name: "algoType",
});

export const basket = TableDef({
  columns: [
    { name: "id", dataType: "string" },
    { name: "name", dataType: "string" },
    { name: "notionalValue", dataType: "double" },
    { name: "notionalValueUsd", dataType: "double" },
  ],
  joinFields: "id",
  keyField: "id",
  name: "basket",
});

export const basketConstituent = TableDef({
  columns: [
    { name: "basketId", dataType: "string" },
    { name: "change", dataType: "string" },
    { name: "description", dataType: "string" },
    { name: "lastTrade", dataType: "string" },
    { name: "ric", dataType: "string" },
    { name: "ricBasketId", dataType: "string" },
    { name: "side", dataType: "string" },
    { name: "volume", dataType: "string" },
    { name: "weighting", dataType: "double" },
  ],
  joinFields: ["ricBasketId", "ric"],
  keyField: "ricBasketId",
  links: VisualLinks(Link("basketId", "basket", "id")),
  name: "basketConstituent",
});

export const basketTrading = TableDef({
  columns: [
    { name: "basketId", dataType: "string" },
    { name: "basketName", dataType: "string" },
    { name: "filledPct", dataType: "double" },
    { name: "fxRateToUsd", dataType: "double" },
    { name: "instanceId", dataType: "string" },
    { name: "side", dataType: "string" },
    { name: "status", dataType: "string" },
    { name: "totalNotional", dataType: "double" },
    { name: "totalNotionalUsd", dataType: "double" },
    { name: "units", dataType: "int" },
  ],
  joinFields: "basketId",
  keyField: "instanceId",
  name: "basketTrading",
});

export const basketTradingConstituent = TableDef({
  columns: [
    { name: "algo", dataType: "string" },
    { name: "algoParams", dataType: "string" },
    { name: "basketId", dataType: "string" },
    { name: "description", dataType: "string" },
    { name: "instanceId", dataType: "string" },
    { name: "instanceIdRic", dataType: "string" },
    { name: "limitPrice", dataType: "double" },
    { name: "notionalLocal", dataType: "double" },
    { name: "notionalUsd", dataType: "double" },
    { name: "pctFilled", dataType: "double" },
    { name: "priceSpread", dataType: "int" },
    { name: "priceStrategyId", dataType: "int" },
    { name: "quantity", dataType: "long" },
    { name: "ric", dataType: "string" },
    { name: "side", dataType: "string" },
    { name: "status", dataType: "string" },
    { name: "venue", dataType: "string" },
    { name: "weighting", dataType: "double" },
  ],
  joinFields: ["instanceIdRic", "ric"],
  keyField: "instanceIdRic",
  name: "basketTradingConstituent",
});

export const prices = TableDef({
  columns: [
    { name: "ask", dataType: "double" },
    { name: "askSize", dataType: "double" },
    { name: "bid", dataType: "double" },
    { name: "bidSize", dataType: "double" },
    { name: "close", dataType: "double" },
    { name: "last", dataType: "double" },
    { name: "open", dataType: "double" },
    { name: "phase", dataType: "string" },
    { name: "ric", dataType: "string" },
    { name: "scenario", dataType: "string" },
  ],
  joinFields: "ric",
  keyField: "ric",
  name: "prices",
});

export const priceStrategyType = TableDef({
  columns: [
    { name: "priceStrategy", dataType: "string" },
    { name: "id", dataType: "int" },
  ],
  joinFields: "id",
  keyField: "id",
  name: "priceStrategyType",
});

const joinColumnNames = [
  "algo",
  "algoParams",
  "ask",
  "askSize",
  "basketId",
  "bid",
  "bidSize",
  "close",
  "description",
  "instanceId",
  "instanceIdRic",
  "last",
  "limitPrice",
  "notionalLocal",
  "notionalUsd",
  "open",
  "pctFilled",
  "phase",
  "priceSpread",
  "priceStrategyId",
  "quantity",
  "ric",
  "scenario",
  "side",
  "status",
  "venue",
  "weighting",
] as const;

export const basketTradingConstituentJoinColumns = (
  basketColumns: Column[],
  priceColumns: Column[],
): Column[] => {
  const columns = new Map(
    [...basketColumns, ...priceColumns].map((column) => [column.name, column]),
  );

  return joinColumnNames.map((name) => {
    const column = columns.get(name);
    if (!column) {
      throw new Error(`Missing basket join column "${name}"`);
    }
    return column;
  });
};
