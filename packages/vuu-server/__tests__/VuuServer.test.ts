import { describe, expect, test } from "bun:test";
import { websocketConnectionHandler } from "@heswell/vuu-server";

import { startTestModule } from "./TestVuuServer";
import { VuuRange, VuuServerMessage } from "@vuu-ui/vuu-protocol-types";

class MockWebSocket {
  constructor(private handler: any) {}
  data = {
    sessionId: "sess-001",
  };
  send(message: string) {
    const vuuMessage = JSON.parse(message) as VuuServerMessage;
    if (vuuMessage.body.type === "HB") {
      this.handler.message(
        this,
        JSON.stringify({ body: { type: "HB_RESP", td: Date.now() } })
      );
    } else if (vuuMessage.body.type === "TABLE_ROW") {
      console.table(vuuMessage.body.rows);
    } else {
      console.log(`SEND ${vuuMessage.body.type}`);
    }
  }
}

const LOGIN_MSG = {
  requestId: "req-001",
  body: { token: "toke-001", type: "LOGIN", user: "steve" },
};
const range_0_10: VuuRange = { from: 0, to: 10 };
const instrumentsTable = { module: "TEST", table: "instruments" };
const SORT_CCY = { sortDefs: [{ column: "currency", sortType: "A" }] };

describe("VuuServer", () => {
  test("simple single table load with updates, simple viewport", async () => {
    const { promise, resolve } = Promise.withResolvers();
    const vuuServer = startTestModule({ startEmpty: true });
    const handler = websocketConnectionHandler({});
    const ws: any = new MockWebSocket(handler);
    handler.open(ws);

    // prettier-ignore
    {
        handler.message( ws, JSON.stringify(LOGIN_MSG));
        handler.message( ws, JSON.stringify({ body: { range: range_0_10, table: instrumentsTable, type: "CREATE_VP" } }));
    }

    setTimeout(() => {
      const provider = vuuServer.getProvider("instruments");

      // prettier-ignore
      provider.loadTest([
        [ "AAA L", "USD", "AAA Incorporated", "NASDAQ", "ABCDE0000", 1009, "AAA.N" ],
        [ "BBB L", "GBP", "BBB Incorporated", "NASDAQ", "BCDEF0000", 1008, "BBB.N" ],
        [ "CCC L", "CHF", "CCC Incorporated", "NASDAQ", "CDEFG0000", 1007, "CCC.N" ],
        [ "DDD L", "USD", "DDD Incorporated", "NASDAQ", "DEFGH0000", 1006, "DDD.N" ],
        [ "EEE L", "HKD", "EEE Incorporated", "NASDAQ", "EFGHI0000", 1005, "EEE.N" ],
        [ "FFF L", "SEK", "FFF Incorporated", "NASDAQ", "FGHIJ0000", 1004, "FFF.N" ],
        [ "GGG L", "EUR", "GGG Incorporated", "NASDAQ", "GHIJK0000", 1003, "GGG.N" ],
        [ "HHH L", "EUR", "HHH Incorporated", "NASDAQ", "HIJKL0000", 1002, "HHH.N" ],
        [ "III L", "GBP", "III Incorporated", "NASDAQ", "IJKLM0000", 1001, "III.N" ],
        [ "JJJ L", "USD", "JJJ Incorporated", "NASDAQ", "JKLMN0000", 1000, "JJJ.N" ]        
      ])

      setTimeout(() => {
        // prettier-ignore
        provider.update([
        [ "AAA L", "USD", "AAA Incorporated", "NASDAQ", "ABCDE0000", 1019, "AAA.N" ],
        [ "DDD L", "USD", "DDD Incorporated", "NASDAQ", "DEFGH0000", 1021, "DDD.N" ],
        [ "III L", "GBP", "III Incorporated", "NASDAQ", "IJKLM0000", 1056, "III.N" ]
      ]);
      }, 300);

      setTimeout(() => {
        resolve();
      }, 500);
    }, 1000);

    return promise;
  });

  test("simple single table load with updates, sorted viewport", async () => {
    const { promise, resolve } = Promise.withResolvers();
    const vuuServer = startTestModule();
    const handler = websocketConnectionHandler({});
    const ws: any = new MockWebSocket(handler);
    handler.open(ws);

    // prettier-ignore
    {
        handler.message( ws, JSON.stringify(LOGIN_MSG));
        handler.message( ws, JSON.stringify({ body: { range: range_0_10, table: instrumentsTable, sort: SORT_CCY, type: "CREATE_VP" } }));
    }

    setTimeout(() => {
      const provider = vuuServer.getProvider("instruments");
      // prettier-ignore
      provider.update([
        [ "AAA L", "USD", "AAA Incorporated", "NASDAQ", "ABCDE0000", 1019, "AAA.N" ],
        [ "DDD L", "USD", "DDD Incorporated", "NASDAQ", "DEFGH0000", 1021, "DDD.N" ],
        [ "III L", "GBP", "III Incorporated", "NASDAQ", "IJKLM0000", 1056, "III.N" ]
      ]);

      setTimeout(() => {
        resolve();
      }, 500);
    }, 1000);

    return promise;
  });
});
