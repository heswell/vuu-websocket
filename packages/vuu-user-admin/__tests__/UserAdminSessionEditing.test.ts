import { describe, expect, test } from "bun:test";
import { Columns } from "@heswell/vuu-server";
import type { RpcParams } from "@heswell/vuu-server";
import { InMemDataTable } from "../../vuu-server/src/core/table/InMemDataTable";
import { TableContainer } from "../../vuu-server/src/core/table/TableContainer";
import { TableDef } from "../../vuu-server/src/api/TableDef";
import { JoinTableProvider } from "../../vuu-server/src/provider/JoinTableProvider";
import { InMemSessionDataTable } from "../../vuu-server/src/core/table/InMemSessionDataTable";
import { UserAdminService } from "../src/modules/user-admin/services/UserAdminService";

const usersColumns = Columns.fromNames(
  "user_id:string",
  "username:string",
  "email:string",
  "first_name:string",
  "last_name:string",
  "enabled:boolean",
  "email_verified:boolean",
  "group_count:int",
  "role_count:int",
  "module_access:string",
  "module_access_count:int",
  "vuuCreatedTimestamp:epochtimestamp",
  "vuuUpdatedTimestamp:epochtimestamp",
  "vuuMsg:string",
);

function createContext() {
  const joinProvider = new JoinTableProvider();
  const tableContainer = new TableContainer(joinProvider);
  const tableDef = TableDef({
    name: "users",
    keyField: "user_id",
    columns: usersColumns,
  });
  tableDef.setModule({ name: "USER_ADMIN" } as never);
  const sourceTable = new InMemDataTable(tableDef, joinProvider);
  sourceTable.insert([
    "u1",
    "alice",
    "alice@example.com",
    "Alice",
    "Admin",
    true,
    true,
    1,
    1,
    "user-admin-access",
    1,
    1,
    1,
    "",
  ]);
  tableContainer.addTable(sourceTable);

  const appliedEdits: unknown[] = [];
  const operations = {
    getUserModuleAccessOptions: async () => ({
      modules: [{
        clientIdentifier: "vuu-portal",
        accessRole: "user-admin-access",
        selectedGroupIds: [],
        groups: [
          {
            groupId: "group-user-admin-read",
            groupName: "group-user-admin-read",
            groupDisplayName: "read",
            roleId: "user-admin-access",
            roleName: "user-admin-access",
            roleDisplayName: "access",
            isDefault: true,
          },
          {
            groupId: "group-user-admin-admin",
            groupName: "group-user-admin-admin",
            groupDisplayName: "admin",
            roleId: "user-admin-access",
            roleName: "user-admin-access",
            roleDisplayName: "access",
            isDefault: false,
          },
        ],
      }],
    }),
    applyUserEdits: async (edits: unknown) => {
      appliedEdits.push(edits);
    },
  };
  let refreshes = 0;
  const service = new UserAdminService(
    tableContainer,
    async () => operations as never,
    async () => {
      refreshes += 1;
    },
  );

  return { service, sourceTable, tableContainer, appliedEdits, get refreshes() { return refreshes; } };
}

async function beginSession(context: ReturnType<typeof createContext>) {
  const result = await context.service.processRpcRequest("beginEditSession", {
    namedParams: { editSessionMode: "inline-all-rows" },
    viewport: { dataTable: context.sourceTable, selectedKeys: new Set() },
    ctx: { session: { sessionId: "test-session" } },
  } as RpcParams);
  if (result.type === "ERROR_RESULT") throw new Error(result.errorMessage);
  const tableName = (result.data as { table: { table: string } }).table.table;
  return context.tableContainer.getTable<InMemSessionDataTable>(tableName);
}

function request(
  context: ReturnType<typeof createContext>,
  rpcName: string,
  dataTable: InMemDataTable | InMemSessionDataTable,
  namedParams: Record<string, unknown>,
) {
  return context.service.processRpcRequest(rpcName, {
    namedParams,
    viewport: { dataTable, selectedKeys: new Set() },
    ctx: { session: { sessionId: "test-session" } },
  } as RpcParams);
}

describe("User Admin user edit sessions", () => {
  test("adds permissions only to the users session schema and saves canonical assignments", async () => {
    const context = createContext();
    const sessionTable = await beginSession(context);

    expect(context.sourceTable.columnMap.permissions).toBeUndefined();
    expect(sessionTable.columnMap.permissions).toBeNumber();
    expect(sessionTable.getRowAtKey("u1")[sessionTable.columnMap.permissions]).toBe("");

    await request(context, "editCell", sessionTable, {
      column: "permissions",
      key: "u1",
      data: JSON.stringify([{
        clientIdentifier: "vuu-portal",
        accessRole: "user-admin-access",
        groupIds: ["group-user-admin-admin", "group-user-admin-read"],
      }]),
    });
    const result = await request(context, "endEditSession", sessionTable, { save: true });

    expect(result).toEqual({ type: "SUCCESS_RESULT", data: undefined });
    expect(context.appliedEdits).toEqual([[
      {
        userId: "u1",
        changes: {},
        assignments: [
          { accessRole: "user-admin-access", groupId: "group-user-admin-admin" },
          { accessRole: "user-admin-access", groupId: "group-user-admin-read" },
        ],
      },
    ]]);
    expect(context.refreshes).toBe(1);
    expect(context.sourceTable.columnMap.permissions).toBeUndefined();
  });

  test("rejects malformed permissions without mutating or closing the session", async () => {
    const context = createContext();
    const sessionTable = await beginSession(context);
    await request(context, "editCell", sessionTable, {
      column: "permissions",
      key: "u1",
      data: "{not-json",
    });

    const result = await request(context, "endEditSession", sessionTable, { save: true });

    expect(result).toEqual({
      type: "ERROR_RESULT",
      errorMessage: "Invalid permissions: expected JSON array",
    });
    expect(context.appliedEdits).toEqual([]);
    expect(context.tableContainer.getTable(sessionTable.name)).toBe(sessionTable);
    expect(context.sourceTable.getRowAtKey("u1")[1]).toBe("alice");
  });

  test("rejects unknown fields and ineligible groups before applying changes", async () => {
    const context = createContext();
    const sessionTable = await beginSession(context);
    await request(context, "editCell", sessionTable, {
      column: "permissions",
      key: "u1",
      data: JSON.stringify([{
        clientIdentifier: "vuu-portal",
        accessRole: "user-admin-access",
        groupIds: ["not-eligible"],
        unexpected: true,
      }]),
    });

    const result = await request(context, "endEditSession", sessionTable, { save: true });

    expect(result).toEqual({
      type: "ERROR_RESULT",
      errorMessage:
        'Invalid permissions application at index 0: unknown field "unexpected"',
    });
    expect(context.appliedEdits).toEqual([]);

    const secondSession = await beginSession(context);
    await request(context, "editCell", secondSession, {
      column: "permissions",
      key: "u1",
      data: JSON.stringify([{
        clientIdentifier: "vuu-portal",
        accessRole: "user-admin-access",
        groupIds: ["not-eligible"],
      }]),
    });
    expect(await request(context, "endEditSession", secondSession, { save: true })).toEqual({
      type: "ERROR_RESULT",
      errorMessage:
        "Invalid permissions group: not-eligible does not grant user-admin-access",
    });
    expect(context.appliedEdits).toEqual([]);
  });

  test("discards permissions changes without applying them", async () => {
    const context = createContext();
    const sessionTable = await beginSession(context);
    await request(context, "editCell", sessionTable, {
      column: "permissions",
      key: "u1",
      data: "[]",
    });

    const result = await request(context, "endEditSession", sessionTable, { save: false });

    expect(result).toEqual({ type: "SUCCESS_RESULT", data: undefined });
    expect(context.appliedEdits).toEqual([]);
    expect(() => context.tableContainer.getTable(sessionTable.name)).toThrow();
  });
});
