import { describe, expect, test } from "bun:test";
import type { RpcParams } from "@heswell/vuu-server";
import {
  createUserAdminModuleAccessFixture,
  InMemoryUserAdminStore,
  type UserAdminOperations,
  type UserAdminSnapshot,
} from "@heswell/user-admin";
import { InMemDataTable } from "../../vuu-server/src/core/table/InMemDataTable";
import { TableContainer } from "../../vuu-server/src/core/table/TableContainer";
import { JoinTableProvider } from "../../vuu-server/src/provider/JoinTableProvider";
import { InMemSessionDataTable } from "../../vuu-server/src/core/table/InMemSessionDataTable";
import { UserAdminService } from "../src/modules/user-admin/services/UserAdminService";
import {
  groupsTable,
  rolesTable,
  usersTable,
} from "../src/modules/user-admin/UserAdminTableDefs";
import { UserAdminGroupsProvider } from "../src/modules/user-admin/providers/UserAdminGroupsProvider";
import { UserAdminRolesProvider } from "../src/modules/user-admin/providers/UserAdminRolesProvider";
import { UserAdminUsersProvider } from "../src/modules/user-admin/providers/UserAdminUsersProvider";
import { reconcileTableRows } from "../src/modules/user-admin/providers/reconcileTableRows";

type TableName = "users" | "groups" | "roles";

const tableDefs = { users: usersTable, groups: groupsTable, roles: rolesTable };
const providers = {
  users: UserAdminUsersProvider,
  groups: UserAdminGroupsProvider,
  roles: UserAdminRolesProvider,
};

function createContext() {
  const fixture = createUserAdminModuleAccessFixture();
  const store = new InMemoryUserAdminStore({
    ...fixture,
    users: [
      { id: "u1", username: "alice", email: "alice@example.com", enabled: true },
      { id: "u2", username: "bob", email: "bob@example.com", enabled: true },
    ],
    userGroups: [],
  });
  const snapshot = () => store.snapshot();
  const joinProvider = new JoinTableProvider();
  const tableContainer = new TableContainer(joinProvider);
  const tables = {} as Record<TableName, InMemDataTable>;
  for (const name of Object.keys(tableDefs) as TableName[]) {
    tableDefs[name].setModule({ name: "USER_ADMIN" } as never);
    tables[name] = new InMemDataTable(tableDefs[name], joinProvider);
    tableContainer.addTable(tables[name]);
  }
  const reload = async () => {
    const current = await snapshot();
    for (const name of Object.keys(tables) as TableName[]) {
      new providers[name](tables[name]).loadSnapshot(current);
    }
  };

  const calls: Array<[string, unknown[]]> = [];
  const operations = new Proxy(store, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function" || property === "snapshot") return value;
      return (...args: unknown[]) => {
        calls.push([String(property), args]);
        return value.apply(target, args);
      };
    },
  }) as UserAdminOperations;

  const refreshReasons: string[] = [];
  const service = new UserAdminService(
    tableContainer,
    async () => operations,
    async (reason) => {
      refreshReasons.push(reason);
      await reload();
    },
    snapshot as () => Promise<UserAdminSnapshot>,
  );

  const call = (
    rpcName: string,
    dataTable: InMemDataTable | InMemSessionDataTable,
    namedParams: Record<string, unknown> = {},
  ) =>
    service.processRpcRequest(rpcName, {
      namedParams,
      viewport: { dataTable, selectedKeys: new Set() },
      ctx: { session: { sessionId: "test-session" } },
    } as RpcParams);

  const beginSession = async (
    name: TableName,
    editSessionMode = "inline-all-rows",
  ) => {
    const result = await call("beginEditSession", tables[name], { editSessionMode });
    if (result.type === "ERROR_RESULT") throw new Error(result.errorMessage);
    const tableName = (result.data as { table: { table: string } }).table.table;
    return tableContainer.getTable<InMemSessionDataTable>(tableName);
  };

  return {
    store,
    tables,
    tableContainer,
    calls,
    refreshReasons,
    call,
    beginSession,
    reload,
    callsTo: (name: string) => calls.filter(([method]) => method === name),
  };
}

type Context = ReturnType<typeof createContext>;

async function setup() {
  const context = createContext();
  await context.reload();
  return context;
}

const groupRoleIds = async (context: Context, groupId: string) =>
  (await context.store.snapshot()).groupRoles
    .filter(({ group }) => group.id === groupId)
    .map(({ role }) => role.id)
    .sort();

const userGroupIds = async (context: Context, userId: string) =>
  (await context.store.snapshot()).userGroups
    .filter(({ user }) => user.id === userId)
    .map(({ group }) => group.id)
    .sort();

const SUCCESS = { type: "SUCCESS_RESULT", data: undefined };

describe("User Admin users edit session", () => {
  test("saves detail edits and application permissions from the UI", async () => {
    const context = await setup();
    const session = await context.beginSession("users");
    expect(session.columnMap.temporary_password).toBeNumber();

    await context.call("editCell", session, { key: "u1", column: "email", data: "a@vuu.io" });
    await context.call("editCell", session, {
      key: "u1",
      column: "permissions",
      data: JSON.stringify([
        // The UI sends the application's own client identifier ...
        {
          clientIdentifier: "vuu-user-admin",
          accessRole: "user-admin-access",
          groupIds: ["group-user-admin-admin", "group-user-admin-read"],
        },
        // ... or an empty one when the application has no client.
        {
          clientIdentifier: "",
          accessRole: "basket-trading-access",
          groupIds: ["group-basket-trading-trade"],
        },
      ]),
    });

    expect(await context.call("endEditSession", session, { save: true })).toEqual(SUCCESS);
    expect((await context.store.snapshot()).users[0].email).toBe("a@vuu.io");
    expect(await userGroupIds(context, "u1")).toEqual([
      "group-basket-trading-trade",
      "group-user-admin-admin",
      "group-user-admin-read",
    ]);
    expect(context.refreshReasons).toEqual([`session:users`]);
    expect(() => context.tableContainer.getTable(session.name)).toThrow();
  });

  test("removes groups when an application is deselected", async () => {
    const context = await setup();
    await context.store.syncUserGroups("u1", [
      "group-user-admin-read",
      "group-basket-trading-read",
    ]);
    await context.reload();
    const session = await context.beginSession("users");
    await context.call("editCell", session, {
      key: "u1",
      column: "permissions",
      data: JSON.stringify([{
        clientIdentifier: "vuu-user-admin",
        accessRole: "user-admin-access",
        groupIds: ["group-user-admin-read"],
      }]),
    });

    expect(await context.call("endEditSession", session, { save: true })).toEqual(SUCCESS);
    expect(await userGroupIds(context, "u1")).toEqual(["group-user-admin-read"]);
  });

  test("passes a temporary password through to the identity provider", async () => {
    const context = await setup();
    const session = await context.beginSession("users");
    await context.call("editCell", session, {
      key: "u1",
      column: "temporary_password",
      data: "s3cret!",
    });

    expect(await context.call("endEditSession", session, { save: true })).toEqual(SUCCESS);
    expect(context.callsTo("applyUserEdits")).toEqual([
      ["applyUserEdits", [[{ userId: "u1", changes: {}, temporaryPassword: "s3cret!" }]]],
    ]);
  });

  test("rejects username changes, unknown access roles and row creation", async () => {
    const context = await setup();
    const session = await context.beginSession("users");
    await context.call("editCell", session, { key: "u1", column: "username", data: "alicia" });
    expect(await context.call("endEditSession", session, { save: true })).toEqual({
      type: "ERROR_RESULT",
      errorMessage: "username is read-only",
    });
    expect(context.tableContainer.getTable(session.name)).toBe(session);
    await context.call("endEditSession", session, { save: false });

    const second = await context.beginSession("users");
    await context.call("editCell", second, {
      key: "u1",
      column: "permissions",
      data: JSON.stringify([{ clientIdentifier: "", accessRole: "nope", groupIds: [] }]),
    });
    expect(await context.call("endEditSession", second, { save: true })).toEqual({
      type: "ERROR_RESULT",
      errorMessage: 'Invalid permissions application: unknown access role "nope"',
    });
    await context.call("endEditSession", second, { save: false });

    const third = await context.beginSession("users");
    await context.call("addRow", third, { data: { username: "carol" } });
    const result = await context.call("endEditSession", third, { save: true });
    expect(result.type).toBe("ERROR_RESULT");
    expect(context.callsTo("applyUserEdits")).toEqual([]);
    expect(context.callsTo("addUser")).toEqual([]);
  });
});

describe("User Admin groups edit session", () => {
  test("creates a group with its role assignments", async () => {
    const context = await setup();
    const session = await context.beginSession("groups", "empty-session-table");
    expect(session.columnMap.group_name).toBeNumber();
    expect(session.columnMap.role_assignments).toBeNumber();

    await context.call("addRow", session, {
      data: {
        group_name: "user-admin-auditor",
        role_assignments: JSON.stringify([
          "portal-client:user-admin-access",
          "user-admin-client:read",
        ]),
      },
    });
    expect(await context.call("endEditSession", session, { save: true })).toEqual(SUCCESS);

    const group = (await context.store.snapshot()).groups.find(
      ({ name }) => name === "user-admin-auditor",
    );
    expect(group).toBeDefined();
    expect(await groupRoleIds(context, group!.id)).toEqual([
      "portal-client:user-admin-access",
      "user-admin-client:read",
    ]);
    expect(context.refreshReasons).toEqual(["session:groups"]);
    const row = context.tables.groups.getRowAtKey(group!.id);
    expect(row[context.tables.groups.columnMap.group_display_name]).toBe("auditor");
    expect(() => context.tableContainer.getTable(session.name)).toThrow();
  });

  test("validates group name and roles before creating anything", async () => {
    const cases: Array<[Record<string, string>, string]> = [
      [{ group_name: "bad name" }, "Group names cannot contain spaces or slashes"],
      [{ group_name: "a/b" }, "Group names cannot contain spaces or slashes"],
      [{ group_name: "" }, "group_name"],
      [
        { group_name: "group-user-admin-read" },
        'A group named "group-user-admin-read" already exists',
      ],
      [
        { group_name: "new-group", role_assignments: JSON.stringify(["missing"]) },
        "User admin role not found: missing",
      ],
      [
        { group_name: "new-group", role_assignments: "{" },
        "Invalid role_assignments: expected JSON array",
      ],
    ];
    for (const [data, message] of cases) {
      const context = await setup();
      const session = await context.beginSession("groups", "empty-session-table");
      await context.call("addRow", session, { data });
      const result = await context.call("endEditSession", session, { save: true });
      expect(result.type).toBe("ERROR_RESULT");
      expect((result as { errorMessage: string }).errorMessage).toContain(message);
      expect(context.callsTo("addGroup")).toEqual([]);
      expect(context.tableContainer.getTable(session.name)).toBe(session);
    }
  });

  test("reconciles role assignments of an edited group", async () => {
    const context = await setup();
    const session = await context.beginSession("groups");
    await context.call("editCell", session, {
      key: "group-user-admin-admin",
      column: "role_assignments",
      data: JSON.stringify([
        "portal-client:user-admin-access",
        "user-admin-client:admin",
      ]),
    });

    expect(await context.call("endEditSession", session, { save: true })).toEqual(SUCCESS);
    expect(await groupRoleIds(context, "group-user-admin-admin")).toEqual([
      "portal-client:user-admin-access",
      "user-admin-client:admin",
    ]);
    expect(context.callsTo("removeRoleFromGroup").map(([, [, role]]) => role)).toEqual([
      { roleId: "user-admin-client:read", roleName: "read" },
    ]);
    expect(context.callsTo("addRoleToGroup")).toEqual([]);
  });

  test("rejects edits to read-only group columns", async () => {
    const context = await setup();
    const session = await context.beginSession("groups");
    await context.call("editCell", session, {
      key: "group-user-admin-admin",
      column: "group_path",
      data: "/elsewhere",
    });
    expect(await context.call("endEditSession", session, { save: true })).toEqual({
      type: "ERROR_RESULT",
      errorMessage: 'groups column "group_path" is read-only',
    });
  });
});

describe("User Admin roles edit session", () => {
  const newRole = {
    client_id: "basket-trading-client",
    client_name: "vuu-basket-trading",
    client_identifier: "vuu-basket-trading",
    role_name: "approve",
    description: "Approve baskets",
  };

  test("creates a client role", async () => {
    const context = await setup();
    const session = await context.beginSession("roles", "empty-session-table");
    await context.call("addRow", session, { data: newRole });

    expect(await context.call("endEditSession", session, { save: true })).toEqual(SUCCESS);
    expect(context.callsTo("addClientRole")).toEqual([
      ["addClientRole", [
        { clientKey: "vuu-basket-trading" },
        { name: "approve", description: "Approve baskets" },
      ]],
    ]);
    expect(context.refreshReasons).toEqual(["session:roles"]);
  });

  test("rejects duplicate names and mismatched clients", async () => {
    const cases: Array<[Record<string, string>, string]> = [
      [{ ...newRole, role_name: "trade" }, 'A role named "trade" already exists on vuu-basket-trading'],
      [{ ...newRole, client_identifier: "vuu-portal" }, "client_id and client_identifier must identify the same client"],
    ];
    for (const [data, errorMessage] of cases) {
      const context = await setup();
      const session = await context.beginSession("roles", "empty-session-table");
      await context.call("addRow", session, { data });
      expect(await context.call("endEditSession", session, { save: true })).toEqual({
        type: "ERROR_RESULT",
        errorMessage,
      });
      expect(context.callsTo("addClientRole")).toEqual([]);
    }
  });

  test("renames and re-describes an existing role", async () => {
    const context = await setup();
    const session = await context.beginSession("roles");
    const key = "basket-trading-client:trade";
    await context.call("editCell", session, { key, column: "role_name", data: "trader" });
    await context.call("editCell", session, { key, column: "description", data: "Trades" });

    expect(await context.call("endEditSession", session, { save: true })).toEqual(SUCCESS);
    expect(context.callsTo("updateClientRole")).toEqual([
      ["updateClientRole", [
        "vuu-basket-trading",
        "trade",
        { name: "trader", description: "Trades" },
      ]],
    ]);
  });

  test("rejects edits to access-role metadata", async () => {
    const context = await setup();
    const session = await context.beginSession("roles");
    await context.call("editCell", session, {
      key: "basket-trading-client:trade",
      column: "client_identifier",
      data: "vuu-portal",
    });
    expect(await context.call("endEditSession", session, { save: true })).toEqual({
      type: "ERROR_RESULT",
      errorMessage: 'roles column "client_identifier" is read-only',
    });
  });
});

describe("User Admin RPCs", () => {
  test("setUserModuleAccess accepts several groups per access role", async () => {
    const context = await setup();
    const result = await context.call("setUserModuleAccess", context.tables.users, {
      userId: "u1",
      assignments: JSON.stringify([
        { accessRole: "user-admin-access", groupId: "group-user-admin-read" },
        { accessRole: "user-admin-access", groupId: "group-user-admin-admin" },
      ]),
    });
    expect(result).toEqual(SUCCESS);
    expect(await userGroupIds(context, "u1")).toEqual([
      "group-user-admin-admin",
      "group-user-admin-read",
    ]);

    const duplicate = await context.call("setUserModuleAccess", context.tables.users, {
      userId: "u1",
      assignments: JSON.stringify([
        { accessRole: "user-admin-access", groupId: "group-user-admin-read" },
        { accessRole: "user-admin-access", groupId: "group-user-admin-read" },
      ]),
    });
    expect(duplicate).toEqual({
      type: "ERROR_RESULT",
      errorMessage:
        "Duplicate module access assignment: user-admin-access -> group-user-admin-read",
    });
  });

  test("addUser and updateUser reject usernames that differ only by case", async () => {
    const context = await setup();
    const added = await context.call("addUser", context.tables.users, {
      username: "ALICE",
      email: "other@example.com",
      temporary_password: "pw",
    });
    expect(added).toEqual({ type: "ERROR_RESULT", errorMessage: "username must be unique" });
    const updated = await context.call("updateUser", context.tables.users, {
      userId: "u2",
      username: "Alice",
    });
    expect(updated).toEqual({ type: "ERROR_RESULT", errorMessage: "username must be unique" });
    expect(context.callsTo("addUser")).toEqual([]);
    expect(context.callsTo("updateUser")).toEqual([]);
  });
});

describe("reconcileTableRows", () => {
  test("keeps timestamps of unchanged rows so open edit sessions stay valid", async () => {
    const context = await setup();
    const table = context.tables.groups;
    const { vuuCreatedTimestamp, vuuUpdatedTimestamp } = table.columnMap;
    const before = [...table.getRowAtKey("group-user-admin-read")];

    const keys = (await context.store.snapshot()).groups.map(({ id }) => id);
    const rows = keys.map((key) => {
      const row = [...table.getRowAtKey(key)];
      row[vuuCreatedTimestamp] = before[vuuCreatedTimestamp] + 1000;
      row[vuuUpdatedTimestamp] = before[vuuUpdatedTimestamp] + 1000;
      return row;
    });
    reconcileTableRows(table, rows);

    expect(table.getRowAtKey("group-user-admin-read")).toEqual(before);
  });
});
