import {
  EditSessionRpcHandler,
  type DataTable,
  type RpcParams,
  type TableContainer,
} from "@heswell/vuu-server";
import { type RpcResult } from "@vuu-ui/vuu-protocol-types";
import {
  executeModuleAdminRpc,
  managedModuleColumnValues,
  managedModulePermissionValues,
  MODULE_ADMIN_RPC,
  type ManagedModule,
  type ModuleAdminRpcName,
} from "@heswell/module-admin";
import type { ModuleState } from "./ModuleStore";

type Params = Record<string, unknown>;
type RowValues = Record<string, string | number | boolean>;

const success = (data: unknown): RpcResult => ({ type: "SUCCESS_RESULT", data });
const failure = (errorMessage: string): RpcResult => ({ type: "ERROR_RESULT", errorMessage });
const toErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export const DEFAULT_MODULE_ADMIN_ROLE = "module-admin-access";

export interface ModuleAdminServiceOptions {
  /** Role a user must hold to create, update, enable/disable or delete modules. */
  adminRole?: string;
  now?: () => number;
}

export class ModuleAdminService extends EditSessionRpcHandler {
  private readonly adminRole: string;
  private readonly now: () => number;

  constructor(
    tableContainer: TableContainer,
    private readonly state: ModuleState,
    { adminRole = DEFAULT_MODULE_ADMIN_ROLE, now = Date.now }: ModuleAdminServiceOptions = {},
  ) {
    super(tableContainer);
    this.adminRole = adminRole;
    this.now = now;
    this.registerRpc(MODULE_ADMIN_RPC.createModule, this.handleModuleAdminRpc("createModule"));
    this.registerRpc(MODULE_ADMIN_RPC.updateModule, this.handleModuleAdminRpc("updateModule"));
    this.registerRpc(MODULE_ADMIN_RPC.setModuleEnabled, this.handleModuleAdminRpc("setModuleEnabled"));
    this.registerRpc(MODULE_ADMIN_RPC.deleteModule, this.handleModuleAdminRpc("deleteModule"));
  }

  private handleModuleAdminRpc(rpcName: ModuleAdminRpcName) {
    return async ({ ctx, namedParams }: RpcParams<Params>) => {
      if (!ctx?.user?.authorizations?.includes(this.adminRole)) {
        return failure(`Administering modules requires the ${this.adminRole} role`);
      }
      try {
        const { modules, result } = executeModuleAdminRpc(
          this.state.modules,
          rpcName,
          namedParams,
          this.now,
        );
        this.state.replaceAndSave(modules);
        this.syncTables(modules);
        return success(result);
      } catch (error) {
        return failure(toErrorMessage(error));
      }
    };
  }

  private syncTables(modules: readonly ManagedModule[]) {
    syncTable(
      this.tableContainer.getTable<DataTable>("modules"),
      modules.map(managedModuleColumnValues),
    );
    syncTable(
      this.tableContainer.getTable<DataTable>("modulePermissions"),
      managedModulePermissionValues(modules),
    );
  }
}

function syncTable(table: DataTable, values: readonly RowValues[]) {
  const expectedKeys = new Set(values.map((row) => String(row[table.schema.key])));
  for (const row of [...table.rows]) {
    const key = String(row[table.indexOfKeyField]);
    if (!expectedKeys.has(key)) table.delete(key);
  }
  for (const rowValues of values) {
    const row = table.tableDef.columns.map(({ name }) => rowValues[name] ?? "");
    const key = String(row[table.indexOfKeyField]);
    const existing = table.getRowAtKey(key, false);
    if (existing) {
      row[table.columnMap.vuuCreatedTimestamp] = existing[table.columnMap.vuuCreatedTimestamp];
      table.update(table.rowIndexAtKey(key), row);
    } else {
      table.insert(row);
    }
  }
}
