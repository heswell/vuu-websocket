import { describe, expect, test } from "bun:test";
import {
  JoinTableProvider,
  type MenuRpcSession,
  TableContainer,
  VuuUser,
} from "@heswell/vuu-server";
import { InstrumentService } from "../src/modules/simul/services/InstrumentService";

describe("InstrumentService menus", () => {
  const service = new InstrumentService(
    {} as any,
    {} as any,
    new TableContainer(new JoinTableProvider()),
  );
  const session = {
    sessionId: "session-1",
    channelId: "channel-1",
    requestId: "req-1",
    user: VuuUser("steve"),
    viewport: { size: 42 },
  } as unknown as MenuRpcSession;

  test("offers a working menu item for every context", async () => {
    const { menuMap } = service;
    const contexts = new Set([...menuMap.values()].map((item) => item.context));
    expect([...contexts].sort()).toEqual(["cell", "grid", "row", "selected-rows"]);

    const call = (rpcName: string, ...args: unknown[]) =>
      (menuMap.get(rpcName) as any).func(...args);

    expect(
      await call("TEST_SELECT", { rowKeys: new Set(["a", "b"]) }, "session-1", session),
    ).toEqual({
      type: "SHOW_NOTIFICATION_ACTION",
      message: "2 instrument(s) selected",
      title: "Test Selection",
    });
    expect(await call("TEST_TABLE", session)).toMatchObject({
      message: "42 instruments, invoked by steve",
    });
    expect(
      await call("TEST_ROW", "VOD.L", { description: "Vodafone" }, session),
    ).toMatchObject({ message: "VOD.L: Vodafone" });
    expect(
      await call("TEST_CURRENCY_CELL", "VOD.L", "currency", "GBP", session),
    ).toMatchObject({ message: "VOD.L.currency = GBP" });
    expect(await call("ADD_ROWS_TO_ORDERS")).toEqual({ type: "NO_ACTION" });
  });
});
