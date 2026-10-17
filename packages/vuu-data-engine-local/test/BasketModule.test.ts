import { expect, test } from "bun:test";
import { BasketModule } from "../src/basket/BasketModule";

test("creates a basket using the Scala createBasket parameter names", async () => {
  const module = new BasketModule();
  try {
    const result = await module.services.basket[0].service({
      type: "RPC_REQUEST",
      rpcName: "createBasket",
      params: {
        sourceBasketId: ".NASDAQ100",
        basketTradeName: "NASDAQ trade",
      },
      context: {
        type: "VIEWPORT_CONTEXT",
        viewPortId: "basket-vp",
      },
    });

    expect(result.type).toBe("SUCCESS_RESULT");
    if (result.type !== "SUCCESS_RESULT") {
      throw Error("Expected basket creation to succeed");
    }
    const table = module.tables.basketTrading;
    expect(table.findByKey(result.data as string)?.[table.map.basketName]).toBe(
      "NASDAQ trade",
    );
  } finally {
    module.dispose();
  }
});
