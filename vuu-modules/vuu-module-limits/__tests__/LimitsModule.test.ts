import { afterEach, describe, expect, test } from "bun:test";
import {
  type DataTable,
  type InMemSessionDataTable,
  LifecycleContainer,
  LoginTokenService,
  type RpcParams,
  VuuServer,
  VuuServerConfig,
  VuuWebSocketOptions,
} from "@heswell/vuu-server";
import type {
  RpcResult,
  VuuRowDataItemType,
} from "@vuu-ui/vuu-protocol-types";
import {
  businessDay,
  LIMIT_DEFINITIONS,
  LimitsModule,
  LimitsStore,
  validateLimitDefinition,
  validateLimitValue,
} from "../src";

const USER = "jsmith";

const vega = {
  entity_id: "DESK-EQD",
  hard: 100,
  metric: "Vega",
  period: "Intraday",
  soft: 90,
  warning: 80,
};

type Service = {
  processRpcRequest: (
    rpcName: string,
    params: RpcParams,
  ) => RpcResult | Promise<RpcResult>;
};

let lifecycle: LifecycleContainer | undefined;

afterEach(async () => {
  await lifecycle?.destroy();
  lifecycle = undefined;
});

const setup = async () => {
  const module = LimitsModule();
  lifecycle = new LifecycleContainer();
  const server = new VuuServer(
    VuuServerConfig(
      VuuWebSocketOptions().withWsPort(0),
      {},
      LoginTokenService(),
    ).withModule(module),
    lifecycle,
  );
  await lifecycle.start();
  const { tableContainer } = server;
  const limits = tableContainer.getTable<DataTable>(LIMIT_DEFINITIONS);

  const serviceFor = (table: DataTable) => {
    const factory = module.viewPortDefs.get(
      table.tableDef.name,
    ) as unknown as (...args: unknown[]) => { service: Service };
    return factory(table, undefined, undefined, tableContainer).service;
  };

  const call = (
    table: DataTable,
    rpcName: string,
    namedParams: Record<string, unknown> = {},
  ) =>
    serviceFor(table).processRpcRequest(rpcName, {
      ctx: {
        session: { channelId: "test-channel", sessionId: "test-session" },
        user: { name: USER },
      },
      namedParams,
      viewport: { dataTable: table, selectedKeys: new Set<string>() },
    } as unknown as RpcParams);

  const createSession = async (sessionType: "edit" | "import") => {
    const result = await call(limits, "createSessionTable", {
      copyOption: sessionType === "edit" ? "All" : "Empty",
      sessionType,
    });
    if (result.type === "ERROR_RESULT") throw Error(result.errorMessage);
    const { table } = result.data as { table: { table: string } };
    return tableContainer.getTable<InMemSessionDataTable>(table.table);
  };

  const save = (session: DataTable) =>
    call(session, "endEditSession", { save: true });

  const addLimits = async (
    ...rows: Record<string, VuuRowDataItemType>[]
  ) => {
    const session = await createSession("edit");
    for (const data of rows) {
      await call(session, "addRow", { data });
    }
    expect(await save(session)).toMatchObject({ type: "SUCCESS_RESULT" });
  };

  const row = (key: string) => {
    const values = limits.getRowAtKey(key, false);
    return values === undefined
      ? undefined
      : Object.fromEntries(
          limits.schema.columns.map(({ name }) => [
            name,
            values[limits.columnMap[name]],
          ]),
        );
  };

  const activate = () => call(limits, "activatePendingLimits");

  /** The editChange of each row of a session, by key. */
  const editChanges = (session: InMemSessionDataTable) =>
    Object.fromEntries(
      session.rows.map((row) => [
        row[session.columnMap.limit_key],
        row[session.columnMap.editChange],
      ]),
    );

  return {
    activate,
    addLimits,
    call,
    createSession,
    editChanges,
    limits,
    row,
    save,
  };
};

describe("validation", () => {
  test("a blank value is accepted, values are checked against reference data", () => {
    expect(validateLimitValue("hard", "")).toBeUndefined();
    expect(validateLimitValue("entity_id", "NOPE")).toBe(
      "entity NOPE is not known",
    );
    expect(validateLimitValue("hard", -1)).toBe(
      "hard must be a number greater than zero",
    );
  });

  test("a limit is checked across its columns", () => {
    expect(validateLimitDefinition(vega)).toBeUndefined();
    expect(validateLimitDefinition({ ...vega, hard: "" })).toBe(
      "hard is required",
    );
    expect(validateLimitDefinition({ ...vega, period: "Daily" })).toBe(
      "period of Vega must be Intraday or Overnight",
    );
    expect(validateLimitDefinition({ ...vega, soft: 200 })).toBe(
      "soft must not be greater than hard",
    );
  });
});

describe("LimitsModule", () => {
  test("saves a new limit as Pending, with the columns the server fills", async () => {
    const { addLimits, row } = await setup();
    await addLimits(vega);
    expect(row("LIM-0001")).toMatchObject({
      ...vega,
      change: "New limit",
      changed_by: USER,
      entity_type: "Desk",
      metric_family: "Sensitivity",
      status: "Pending",
    });
    expect(Number(row("LIM-0001")?.effective_from)).toBeGreaterThan(0);
  });

  test("saves nothing unless every limit is valid", async () => {
    const { call, createSession, limits, save } = await setup();
    const session = await createSession("edit");
    await call(session, "addRow", { data: vega });
    await call(session, "addRow", { data: { ...vega, soft: 200 } });
    expect(await save(session)).toEqual({
      type: "ERROR_RESULT",
      errorMessage:
        "1 limit could not be saved. LIM-0002: soft must not be greater than hard",
    });
    expect(limits.rows).toHaveLength(0);
    expect(
      session.getRowAtKey("LIM-0002")[session.columnMap.vuuMsg],
    ).toBe("soft must not be greater than hard");
  });

  test("on the next business day, a new limit becomes Active", async () => {
    const { activate, addLimits, row } = await setup();
    await addLimits(vega);
    await activate();
    expect(row("LIM-0001")).toMatchObject({ change: "", status: "Active" });
  });

  test("a change to an Active limit is held until the next business day", async () => {
    const { activate, addLimits, call, createSession, row, save } =
      await setup();
    await addLimits(vega);
    await activate();

    const session = await createSession("edit");
    await call(session, "editCell", {
      column: "hard",
      data: 150,
      key: "LIM-0001",
    });
    expect(await save(session)).toMatchObject({ type: "SUCCESS_RESULT" });
    expect(row("LIM-0001")).toMatchObject({
      change: "hard changes to 150",
      changed_by: USER,
      hard: 100,
      status: "Pending",
    });

    await activate();
    expect(row("LIM-0001")).toMatchObject({
      change: "",
      hard: 150,
      status: "Active",
    });
  });

  test("editChange describes the change saving each row will make", async () => {
    const { activate, addLimits, call, createSession, editChanges } =
      await setup();
    await addLimits(vega, { ...vega, entity_id: "DESK-CASH" });
    await activate();

    const session = await createSession("edit");
    expect(editChanges(session)).toEqual({ "LIM-0001": "", "LIM-0002": "" });
    await call(session, "editCell", { column: "hard", data: 150, key: "LIM-0001" });
    await call(session, "editCell", { column: "soft", data: 95, key: "LIM-0001" });
    await call(session, "deleteRow", { key: "LIM-0002" });
    await call(session, "addRow", { data: { ...vega, entity_id: "DESK-RATES" } });
    expect(editChanges(session)).toEqual({
      "LIM-0001": "soft changes to 95, hard changes to 150",
      "LIM-0002": "Set to delete",
      "LIM-0003": "New limit",
    });
    expect(
      await call(session, "editCell", {
        column: "editChange",
        data: "nope",
        key: "LIM-0001",
      }),
    ).toMatchObject({ type: "ERROR_RESULT" });
  });

  test("saving sets change to editChange, which includes changes already held", async () => {
    const { activate, addLimits, call, createSession, editChanges, row, save } =
      await setup();
    await addLimits(vega);
    await activate();

    const first = await createSession("edit");
    await call(first, "editCell", { column: "hard", data: 150, key: "LIM-0001" });
    await save(first);

    const second = await createSession("edit");
    expect(editChanges(second)).toEqual({ "LIM-0001": "hard changes to 150" });
    await call(second, "editCell", { column: "soft", data: 95, key: "LIM-0001" });
    expect(await save(second)).toMatchObject({ type: "SUCCESS_RESULT" });
    expect(row("LIM-0001")).toMatchObject({
      change: "soft changes to 95, hard changes to 150",
      hard: 100,
      soft: 90,
      status: "Pending",
    });

    await activate();
    expect(row("LIM-0001")).toMatchObject({
      change: "",
      hard: 150,
      soft: 95,
      status: "Active",
    });
  });

  test("a Pending new limit is changed directly", async () => {
    const { addLimits, call, createSession, row, save } = await setup();
    await addLimits(vega);
    const session = await createSession("edit");
    await call(session, "editCell", {
      column: "hard",
      data: 150,
      key: "LIM-0001",
    });
    await save(session);
    expect(row("LIM-0001")).toMatchObject({
      change: "New limit",
      hard: 150,
      status: "Pending",
    });
  });

  test("deleting an Active limit waits for the next business day, a new one is removed", async () => {
    const { activate, addLimits, call, createSession, row, save } =
      await setup();
    await addLimits(vega);
    await activate();
    await addLimits({ ...vega, entity_id: "DESK-CASH" });

    const session = await createSession("edit");
    await call(session, "deleteRow", { key: "LIM-0001" });
    await call(session, "deleteRow", { key: "LIM-0002" });
    expect(await save(session)).toMatchObject({ type: "SUCCESS_RESULT" });
    expect(row("LIM-0002")).toBeUndefined();
    expect(row("LIM-0001")).toMatchObject({
      change: "Set to delete",
      status: "Pending",
    });

    await activate();
    expect(row("LIM-0001")).toBeUndefined();
  });

  test("columns set when a limit is added cannot be changed after", async () => {
    const { addLimits, call, createSession } = await setup();
    await addLimits(vega);
    const session = await createSession("edit");
    expect(
      await call(session, "editCell", {
        column: "metric",
        data: "Delta",
        key: "LIM-0001",
      }),
    ).toMatchObject({
      type: "ERROR_RESULT",
      errorMessage: "metric can only be set when a limit is added",
    });

    await call(session, "addRow", { data: vega });
    expect(
      await call(session, "editCell", {
        column: "metric",
        data: "Delta",
        key: "LIM-0002",
      }),
    ).toMatchObject({ type: "SUCCESS_RESULT" });
  });

  test("names an invalid import row by its line in the file", async () => {
    const { call, createSession, limits, save } = await setup();
    const session = await createSession("import");
    await call(session, "addRow", { data: { ...vega, vuuRowNum: 1 } });
    await call(session, "addRow", {
      data: { ...vega, period: "Daily", vuuRowNum: 2 },
    });
    expect(await save(session)).toEqual({
      type: "ERROR_RESULT",
      errorMessage:
        "1 limit could not be saved. line 3: period of Vega must be Intraday or Overnight",
    });
    expect(limits.rows).toHaveLength(0);
  });
});

describe("business day", () => {
  const friday = new Date(2026, 10, 20, 15).getTime();
  const saturday = new Date(2026, 10, 21, 9).getTime();
  const monday = new Date(2026, 10, 23, 7).getTime();

  test("the weekend belongs to the Friday before", () => {
    expect(businessDay(saturday)).toBe(businessDay(friday));
    expect(businessDay(monday)).toBeGreaterThan(businessDay(friday));
  });

  test("Pending limits become Active when a new business day begins", async () => {
    const { limits, row } = await setup();
    const store = new LimitsStore(limits, friday);
    store.save(
      [{ action: "addRow", key: "LIM-0009", values: vega }],
      USER,
    );
    store.activateOnNewBusinessDay(saturday);
    expect(row("LIM-0009")).toMatchObject({ status: "Pending" });
    store.activateOnNewBusinessDay(monday);
    expect(row("LIM-0009")).toMatchObject({ status: "Active" });
  });
});
