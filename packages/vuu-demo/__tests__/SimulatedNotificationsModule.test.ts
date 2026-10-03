import { describe, expect, test } from "bun:test";
import { VuuUser } from "@heswell/vuu-server";
import { InMemDataTable } from "@heswell/vuu-server/src/core/table/InMemDataTable";
import { TableContainer } from "@heswell/vuu-server/src/core/table/TableContainer";
import { JoinTableProvider } from "@heswell/vuu-server/src/provider/JoinTableProvider";
import { ProviderContainer } from "@heswell/vuu-server/src/provider/ProviderContainer";
import { ViewportContainer } from "@heswell/vuu-server/src/viewport/ViewportContainer";
import { OutboundRowPublishQueue } from "@heswell/vuu-server/src/util/PublishQueue";
import { RpcParams } from "@heswell/vuu-server/src/net/rpc/Rpc";
import { RequestContext } from "@heswell/vuu-server/src/net/RequestProcessor";
import { SimulatedNotificationsModule } from "../src/modules/notifications";
import { formatMessage } from "../src/modules/notifications/providers/SimulatedNotificationsProvider";

const setup = async () => {
  const module = SimulatedNotificationsModule();
  const [tableDef] = module.tableDefs;
  tableDef.setModule(module);
  const joinProvider = new JoinTableProvider();
  const tableContainer = new TableContainer(joinProvider);
  const table = new InMemDataTable(tableDef, joinProvider);
  tableContainer.addTable(table);
  const provider = module.getProviderForTable(table);
  table.provider = provider;
  provider.bind(tableContainer);
  await provider.doStart();
  return { module, provider, table, tableContainer };
};

describe("SimulatedNotificationsModule", () => {
  test("formatMessage", () => {
    expect(
      formatMessage(
        "Order #%04d filled %d shares of AAPL at $%d.%02d",
        12,
        300,
        150,
        7,
      ),
    ).toBe("Order #0012 filled 300 shares of AAPL at $150.07");
    expect(formatMessage("exceeded limit by %d%%", 15)).toBe(
      "exceeded limit by 15%",
    );
  });

  test("provider populates initial notifications", async () => {
    const { provider, table } = await setup();
    try {
      // 3 initial notifications, plus one from first run of the runner
      expect(table.rows.length).toBe(4);
      const { columnMap } = table;
      for (const row of table.rows) {
        expect(row[columnMap.id]).toBeString();
        expect(["toast", "banner"]).toContain(row[columnMap.type] as string);
        expect(["INFO", "WARNING", "ERROR"]).toContain(
          row[columnMap.level] as string,
        );
        expect(row[columnMap.expiryTime] as number).toBeGreaterThan(
          Date.now(),
        );
        expect(row[columnMap.message]).not.toMatch(/%0?\d*d/);
      }
    } finally {
      await provider.doStop();
    }
  });

  test("viewport is permission filtered, dismissNotification updates selected rows", async () => {
    const { module, provider, table, tableContainer } = await setup();
    try {
      const viewportContainer = new ViewportContainer(
        tableContainer,
        {} as ProviderContainer,
      );
      for (const [tableName, serviceFactory] of module.viewPortDefs) {
        viewportContainer.addViewPortDefinition(tableName, serviceFactory);
      }
      const user = VuuUser("steve");
      const session = { sessionId: "session-1", channelId: "channel-1" };
      const queue = new OutboundRowPublishQueue();
      const viewport = viewportContainer.create(
        "req-1",
        user,
        session,
        queue,
        table,
        {
          type: "CREATE_VP",
          table: table.tableDef.asVuuTable,
          columns: table.tableDef.columns.map((c) => c.name),
          filterSpec: { filter: "" },
          groupBy: [],
          range: { from: 0, to: 100 },
          sort: { sortDefs: [] },
        },
      );

      const { columnMap } = table;
      const allowedAudience = new Set(["all", "steve", "admin", "trader"]);
      const expectedVisible = table.rows.filter((row) =>
        allowedAudience.has(row[columnMap.audience] as string),
      );
      expect(viewport.size).toBe(expectedVisible.length);

      if (expectedVisible.length === 0) {
        return;
      }
      const rowKey = expectedVisible[0][columnMap.id] as string;
      viewport.selectRow(rowKey, false);

      const result = await viewport.viewPortDef.service.processRpcRequest(
        "dismissNotification",
        RpcParams({}, viewport, RequestContext("req-2", user, session, queue)),
      );
      expect(result).toEqual({
        type: "SUCCESS_RESULT",
        data: { success: true, dismissedCount: 1 },
      });
      const row = table.getRowAtKey(rowKey);
      expect(row[columnMap.status]).toBe("dismissed");
      expect(row[columnMap.dismissedBy]).toBe("steve");
    } finally {
      await provider.doStop();
    }
  });
});
