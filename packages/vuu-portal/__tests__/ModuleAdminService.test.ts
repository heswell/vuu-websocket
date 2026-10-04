import { describe, expect, test } from "bun:test";
import { InMemDataTable } from "@heswell/vuu-server/src/core/table/InMemDataTable";
import { TableContainer } from "@heswell/vuu-server/src/core/table/TableContainer";
import { JoinTableProvider } from "@heswell/vuu-server";
import { EMPTY_MODULE_CONFIG, type ManagedModule } from "@heswell/module-admin";
import { ModuleAdminService } from "../src/modules/ModuleDiscovery/ModuleAdminService";
import { InMemoryModuleStore, ModuleState } from "../src/modules/ModuleDiscovery/ModuleStore";
import { modulePermissionsTable, modulesTable } from "../src/modules/ModuleDiscovery/ModuleDiscoveryTableDefs";

const baseModule: ManagedModule = {
  ...EMPTY_MODULE_CONFIG,
  id: 1,
  version: 1,
  created: 1,
  updated: 1,
  name: "alpha",
  title: "Alpha",
  enabled: true,
  location: "/Tools/Alpha",
  path: "/alpha",
  mfComponent: "Alpha",
  mfScope: "alpha",
  mfUrl: "https://example.com/alpha.js",
  accessRole: "alpha-access",
};

describe("ModuleAdminService", () => {
  test("creates, updates, toggles and deletes modules while syncing tables and persistence", async () => {
    const { service, state, tables, store } = setup([baseModule]);
    const create = await rpc(service, "createModule", { module: JSON.stringify({ ...EMPTY_MODULE_CONFIG, name: "beta", title: "Beta", enabled: true, location: "/Tools/Beta", path: "/beta", mfComponent: "Beta", mfScope: "beta", mfUrl: "https://example.com/beta.js", accessRole: "beta-access" }) });
    expect(create).toEqual({ type: "SUCCESS_RESULT", data: { id: 2, version: 1 } });
    expect(tables.modules.getRowAtKey("2")[tables.modules.columnMap.name]).toBe("beta");
    expect(tables.permissions.getRowAtKey("2")[tables.permissions.columnMap.role]).toBe("beta-access");
    expect(store.saved).toHaveLength(1);

    const update = await rpc(service, "updateModule", { id: 2, changes: JSON.stringify({ title: "Beta 2" }), expectedVersion: 1 });
    expect(update).toEqual({ type: "SUCCESS_RESULT", data: { id: 2, version: 2 } });
    expect(tables.modules.getRowAtKey("2")[tables.modules.columnMap.title]).toBe("Beta 2");

    const disabled = await rpc(service, "setModuleEnabled", { id: 2, enabled: false });
    expect(disabled).toEqual({ type: "SUCCESS_RESULT", data: { id: 2, version: 2 } });
    expect(tables.modules.getRowAtKey("2")[tables.modules.columnMap.enabled]).toBe(false);

    const deleted = await rpc(service, "deleteModule", { id: 2, deleteChildren: false });
    expect(deleted).toEqual({ type: "SUCCESS_RESULT", data: { deletedIds: [2] } });
    expect(tables.modules.getRowAtKey("2", false)).toBeUndefined();
    expect(tables.permissions.getRowAtKey("2", false)).toBeUndefined();
    expect(state.modules.map(({ id }) => id)).toEqual([1]);
  });

  test("rejects module admin rpcs from users without the admin role", async () => {
    const { service, state, store } = setup([baseModule]);
    for (const [rpcName, params] of [
      ["createModule", { module: JSON.stringify({ ...baseModule, id: undefined, name: "beta" }) }],
      ["updateModule", { id: 1, changes: JSON.stringify({ title: "Hacked" }), expectedVersion: 1 }],
      ["setModuleEnabled", { id: 1, enabled: false }],
      ["deleteModule", { id: 1, deleteChildren: true }],
    ] as const) {
      const result = await rpc(service, rpcName, params, ["alpha-access"]);
      expect(result).toMatchObject({ type: "ERROR_RESULT", errorMessage: "Administering modules requires the module-admin-access role" });
    }
    expect(state.modules).toEqual([baseModule]);
    expect(store.saved).toHaveLength(0);
  });

  test("failed save leaves state and tables unchanged", async () => {
    const store = new ThrowingStore([baseModule]);
    const { service, state, tables } = setup([baseModule], store);
    const result = await rpc(service, "createModule", { module: JSON.stringify({ ...EMPTY_MODULE_CONFIG, name: "beta", title: "Beta", enabled: true, location: "/Tools/Beta", path: "/beta", mfComponent: "Beta", mfScope: "beta", mfUrl: "https://example.com/beta.js", accessRole: "beta-access" }) });
    expect(result).toMatchObject({ type: "ERROR_RESULT", errorMessage: "save failed" });
    expect(state.modules).toEqual([baseModule]);
    expect(tables.modules.getRowAtKey("2", false)).toBeUndefined();
  });
});

class RecordingStore extends InMemoryModuleStore {
  saved: readonly ManagedModule[][] = [];
  override save(modules: readonly ManagedModule[]) {
    this.saved = [...this.saved, modules.map((module) => ({ ...module }))];
    super.save(modules);
  }
}
class ThrowingStore extends RecordingStore {
  override save() { throw new Error("save failed"); }
}

function setup(modules: readonly ManagedModule[], store = new RecordingStore(modules)) {
  const state = new ModuleState(store, store.load());
  const tableContainer = new TableContainer(new JoinTableProvider());
  modulesTable.setModule({ name: "MODULE_DISCOVERY" } as any);
  modulePermissionsTable.setModule({ name: "MODULE_DISCOVERY" } as any);
  const moduleTable = new InMemDataTable(modulesTable);
  const permissionTable = new InMemDataTable(modulePermissionsTable);
  tableContainer.addTable(moduleTable);
  tableContainer.addTable(permissionTable);
  for (const module of modules) {
    moduleTable.insert(row(moduleTable, moduleRow(module)));
    if (module.accessRole) permissionTable.insert(row(permissionTable, { id: module.id, module_id: module.id, role: module.accessRole, vuuCreatedTimestamp: module.created, vuuUpdatedTimestamp: module.updated, vuuMsg: "" }));
  }
  return { service: new ModuleAdminService(tableContainer, state, { now: () => 10 }), state, store, tables: { modules: moduleTable, permissions: permissionTable } };
}

function moduleRow(module: ManagedModule) {
  return { ...module, vuuCreatedTimestamp: module.created, vuuUpdatedTimestamp: module.updated, vuuMsg: "" };
}
function row(table: InMemDataTable, values: Record<string, unknown>) {
  return table.tableDef.columns.map(({ name }) => values[name] ?? "") as any[];
}
function rpc(service: ModuleAdminService, rpcName: string, namedParams: Record<string, unknown>, authorizations = ["module-admin-access"]) {
  return service.processRpcRequest(rpcName, { namedParams, viewport: {}, ctx: { user: { authorizations } } } as any);
}
