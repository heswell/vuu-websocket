import { describe, expect, test } from "bun:test";
import {
  AllowAllPermissionFilter,
  DenyAllPermissionFilter,
  NotificationModule,
  NotificationsSchema,
  PermissionFilter,
  ViewPortDef,
  VuuUser,
} from "@heswell/vuu-server";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import { InMemDataTable } from "../src/core/table/InMemDataTable";
import { TableContainer } from "../src/core/table/TableContainer";
import { JoinTableProvider } from "../src/provider/JoinTableProvider";
import { NullProvider } from "../src/provider/Provider";
import { ProviderContainer } from "../src/provider/ProviderContainer";
import { ViewportContainer } from "../src/viewport/ViewportContainer";
import { OutboundRowPublishQueue } from "../src/util/PublishQueue";

const createNotificationModule = () =>
  NotificationModule(
    (table) => new NullProvider(table),
    (viewport) =>
      PermissionFilter("audience", new Set(["all", viewport.user.name])),
    (table) => ViewPortDef.default(table.tableDef.columns),
    "source:String",
    "priority:Int",
  );

describe("NotificationsSchema", () => {
  test("generic notification columns", () => {
    expect(NotificationsSchema.allFrom().map((c) => c.name)).toEqual([
      "id",
      "type",
      "expiryTime",
      "title",
      "message",
      "level",
      "audience",
    ]);
  });

  test("generic columns with additional columns", () => {
    expect(
      NotificationsSchema.allFrom("source:String", "priority:Int"),
    ).toEqual([
      { name: "id", dataType: "string" },
      { name: "type", dataType: "string" },
      { name: "expiryTime", dataType: "epochtimestamp" },
      { name: "title", dataType: "string" },
      { name: "message", dataType: "string" },
      { name: "level", dataType: "string" },
      { name: "audience", dataType: "string" },
      { name: "source", dataType: "string" },
      { name: "priority", dataType: "int" },
    ]);
  });

  test("rejects invalid column definitions", () => {
    expect(() => NotificationsSchema.allFrom("source:Banana")).toThrow();
  });
});

describe("NotificationModule", () => {
  test("creates NOTIFICATIONS module with notifications table", () => {
    const module = createNotificationModule();
    expect(module.name).toBe(NotificationModule.NAME);
    expect(module.name).toBe("NOTIFICATIONS");
    expect(module.tableDefs).toHaveLength(1);

    const [tableDef] = module.tableDefs;
    expect(tableDef.name).toBe(NotificationModule.TABLE_NAME);
    expect(tableDef.keyField).toBe("id");
    expect(tableDef.joinFields).toEqual(["id"]);
    expect(tableDef.permissionFunction).toBeFunction();
    expect(tableDef.columns.map(({ name }) => name)).toEqual([
      "id",
      "type",
      "expiryTime",
      "title",
      "message",
      "level",
      "audience",
      "source",
      "priority",
      "vuuCreatedTimestamp",
      "vuuUpdatedTimestamp",
      "vuuMsg",
    ]);
  });
});

describe("PermissionFilter", () => {
  const columnMap = { id: 0, audience: 1, priority: 2 };
  const rows: VuuDataRow[] = [
    ["1", "all", 1],
    ["2", "admin", 2],
    ["3", "steve", 3],
  ];
  const visibleIds = (filter: PermissionFilter) => {
    const predicate = filter.createPredicate(columnMap);
    return rows.filter(predicate).map((row) => row[0]);
  };

  test("allow all, deny all", () => {
    expect(visibleIds(AllowAllPermissionFilter)).toEqual(["1", "2", "3"]);
    expect(visibleIds(DenyAllPermissionFilter)).toEqual([]);
  });

  test("contains", () => {
    expect(visibleIds(PermissionFilter("audience", new Set(["all"])))).toEqual(
      ["1"],
    );
    expect(visibleIds(PermissionFilter("priority", new Set(["2", "3"])))).toEqual(
      ["2", "3"],
    );
    expect(visibleIds(PermissionFilter("missing", new Set(["all"])))).toEqual(
      [],
    );
    expect(visibleIds(PermissionFilter("audience", new Set()))).toEqual([]);
  });

  test("row predicate", () => {
    expect(
      visibleIds(PermissionFilter((row) => (row.get("priority") as number) > 1)),
    ).toEqual(["2", "3"]);
  });

  test("chain", () => {
    expect(
      visibleIds(
        PermissionFilter([
          PermissionFilter("audience", new Set(["all", "steve"])),
          PermissionFilter((row) => (row.get("priority") as number) > 1),
        ]),
      ),
    ).toEqual(["3"]);
  });
});

describe("Viewport permission filtering", () => {
  const createViewport = (username: string) => {
    const module = createNotificationModule();
    const [tableDef] = module.tableDefs;
    tableDef.setModule(module);
    const joinProvider = new JoinTableProvider();
    const tableContainer = new TableContainer(joinProvider);
    const table = new InMemDataTable(tableDef, joinProvider);
    const { columnMap } = table;
    const row = (id: string, audience: string) => {
      const row: VuuDataRow = Array(table.schema.columns.length).fill("");
      row[columnMap.id] = id;
      row[columnMap.audience] = audience;
      return row;
    };
    table.insert(row("n1", "all"), false);
    table.insert(row("n2", "admin"), false);
    table.insert(row("n3", "steve"), false);
    tableContainer.addTable(table);

    const viewportContainer = new ViewportContainer(
      tableContainer,
      {} as ProviderContainer,
    );
    const viewport = viewportContainer.create(
      "req-1",
      VuuUser(username),
      { sessionId: "session-1", channelId: "channel-1" },
      new OutboundRowPublishQueue(),
      table,
      {
        type: "CREATE_VP",
        table: tableDef.asVuuTable,
        columns: ["id", "audience"],
        filterSpec: { filter: "" },
        groupBy: [],
        range: { from: 0, to: 100 },
        sort: { sortDefs: [] },
      },
    );
    return { row, table, viewport };
  };

  const visibleKeys = (viewport: ReturnType<typeof createViewport>["viewport"]) =>
    viewport.getDataForCurrentRange().rows.map((r) => r.rowKey);

  test("rows are restricted by viewport user", () => {
    const { viewport: steveViewport } = createViewport("steve");
    expect(visibleKeys(steveViewport)).toEqual(["n1", "n3"]);

    const { viewport: adminViewport } = createViewport("admin");
    expect(visibleKeys(adminViewport)).toEqual(["n1", "n2"]);
  });

  test("permission filter is applied to rows inserted and deleted later", () => {
    const { row, table, viewport } = createViewport("steve");
    table.upsert(row("n4", "admin"));
    table.upsert(row("n5", "steve"));
    expect(visibleKeys(viewport)).toEqual(["n1", "n3", "n5"]);
    table.delete("n1");
    expect(visibleKeys(viewport)).toEqual(["n3", "n5"]);
  });

  test("client filter is combined with permission filter", () => {
    const { viewport } = createViewport("steve");
    viewport.changeViewport({ filterSpec: { filter: 'audience = "all"' } });
    expect(visibleKeys(viewport)).toEqual(["n1"]);
    viewport.changeViewport({ filterSpec: { filter: "" } });
    expect(visibleKeys(viewport)).toEqual(["n1", "n3"]);
  });
});
