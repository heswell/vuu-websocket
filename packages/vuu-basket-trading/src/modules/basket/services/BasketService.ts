import {
  type DataTable,
  DefaultRpcHandler,
  getLogger,
  NoAction,
  type RpcParams,
  SelectionViewPortMenuItem,
  type TableContainer,
  ViewPortMenu,
} from "@heswell/vuu-server";
import type { RpcResult, VuuDataRow } from "@vuu-ui/vuu-protocol-types";

type CreateBasketParams = {
  sourceBasketId?: string;
  basketTradeName?: string;
};

let basketIncrement = 1;
const log = getLogger("basket.service");

const tradingQuantity = (volume: unknown, ric: string): number => {
  const text = String(volume ?? "").trim().replaceAll(",", "");
  if (text === "") {
    log.warn(`No reference volume for ${ric}; initializing quantity to zero`);
    return 0;
  }
  const match = /^(\d+(?:\.\d+)?)\s*([KMB]?)$/i.exec(text);
  if (!match) throw new Error(`Invalid reference volume for ${ric}`);
  const suffix = match[2].toUpperCase();
  const multiplier = suffix === "B" ? 1_000_000_000
    : suffix === "M" ? 1_000_000 : suffix === "K" ? 1_000 : 1;
  const quantity = Math.round(Number(match[1]) * multiplier);
  if (!Number.isSafeInteger(quantity)) {
    throw new Error(`Invalid reference volume for ${ric}`);
  }
  return quantity;
};

const failure = (errorMessage: string): RpcResult => ({
  type: "ERROR_RESULT",
  errorMessage,
});

const requiredString = (value: unknown, name: string) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid RPC param "${name}"`);
  }
  return value.trim();
};

export class BasketService extends DefaultRpcHandler {
  constructor(
    private readonly basketTable: DataTable,
    private readonly basketTradingTable: DataTable,
    private readonly constituentTable: DataTable,
    private readonly tradingConstituentTable: DataTable,
    tableContainer: TableContainer,
  ) {
    super(tableContainer);
    this.registerRpc("createBasket", this.createBasket);
  }

  get menuItems() {
    return ViewPortMenu(
      new SelectionViewPortMenuItem(
        "Add Basket",
        "",
        () => NoAction(),
        "CREATE_NEW_BASKET",
      ),
    );
  }

  private readonly createBasket = ({
    namedParams,
  }: RpcParams<CreateBasketParams>): RpcResult => {
    const insertedConstituentKeys: string[] = [];
    let instanceId: string | undefined;

    try {
      const sourceBasketId = requiredString(
        namedParams.sourceBasketId,
        "sourceBasketId",
      );
      const basketTradeName = requiredString(
        namedParams.basketTradeName,
        "basketTradeName",
      );
      this.basketTable.getRowAtKey(sourceBasketId);

      const generatedInstanceId = this.nextInstanceId();
      instanceId = generatedInstanceId;
      const tradingRow: VuuDataRow = [
        sourceBasketId,
        basketTradeName,
        0,
        1.25,
        generatedInstanceId,
        "BUY",
        "OFF MARKET",
        1_000_000,
        1_250_000,
        100,
      ];

      const sourceRows = this.constituentTable.rows.filter(
        (row) => row[this.constituentTable.columnMap.basketId] === sourceBasketId,
      );
      const tradingRows = sourceRows.map((row): VuuDataRow => {
        const ric = row[this.constituentTable.columnMap.ric] as string;
        return [
          "",
          "",
          sourceBasketId,
          row[this.constituentTable.columnMap.description],
          generatedInstanceId,
          `${generatedInstanceId}-${ric}`,
          95,
          0,
          0,
          0,
          0,
          2,
          tradingQuantity(row[this.constituentTable.columnMap.volume], ric),
          ric,
          "BUY",
          "",
          "venue",
          row[this.constituentTable.columnMap.weighting],
        ];
      });

      this.basketTradingTable.insert(tradingRow);
      for (const row of tradingRows) {
        this.tradingConstituentTable.insert(row);
        insertedConstituentKeys.push(
          row[this.tradingConstituentTable.indexOfKeyField] as string,
        );
      }

      return { type: "SUCCESS_RESULT", data: generatedInstanceId };
    } catch (error) {
      for (const key of insertedConstituentKeys.reverse()) {
        this.tradingConstituentTable.delete(key);
      }
      if (
        instanceId &&
        this.basketTradingTable.rowIndexAtKey(instanceId) !== -1
      ) {
        this.basketTradingTable.delete(instanceId);
      }
      return failure(error instanceof Error ? error.message : String(error));
    }
  };

  private nextInstanceId() {
    let candidate: string;
    do {
      candidate = `steve-${basketIncrement++}`;
    } while (this.basketTradingTable.rowIndexAtKey(candidate) !== -1);
    return candidate;
  }
}
