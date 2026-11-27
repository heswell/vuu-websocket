import {
  RpcNames,
  type CellEdit,
  type InMemSessionDataTable,
  type RpcParams,
  type Viewport,
} from "@heswell/vuu-server";
import type { RpcResult } from "@vuu-ui/vuu-protocol-types";
import {
  ENTITY_LIMIT_OWN_COLUMNS,
  resolveEntityLimits,
  validateEntityLimitValue,
} from "./entityLimits";
import { EntityLimitsService } from "./EntityLimitsService";

/** The requests that change the rows of a session. */
const SESSION_CHANGES: readonly string[] = [
  RpcNames.EditCellRpc,
  RpcNames.UndoRowChangeRpc,
];

/**
 * Service of viewports on the edit-entityLimits session table. Only an
 * entity's own values can be edited. After each change the effective values
 * of the session are resolved, and vuuMsg names the cap a row breaks, if
 * any. Nothing is saved while any cap is broken.
 */
export class EntityLimitsSessionService extends EntityLimitsService {
  async processRpcRequest(
    rpcName: string,
    rpcParams: RpcParams,
  ): Promise<RpcResult> {
    const result = await super.processRpcRequest(rpcName, rpcParams);
    if (SESSION_CHANGES.includes(rpcName)) {
      this.#resolveSession(
        rpcParams.viewport.dataTable as InMemSessionDataTable,
      );
    }
    return result;
  }

  protected validateCellEdit({ column, value }: CellEdit) {
    if (!ENTITY_LIMIT_OWN_COLUMNS.includes(column)) {
      return `${column} cannot be edited`;
    }
    return validateEntityLimitValue(column, value);
  }

  protected canSaveSession(viewport: Viewport): boolean | string {
    const sessionTable = viewport.dataTable as InMemSessionDataTable;
    const { vuuMsg } = sessionTable.columnMap;
    const breach = sessionTable.rows.find((row) => row[vuuMsg]);
    return breach === undefined ? true : `nothing saved: ${breach[vuuMsg]}`;
  }

  /**
   * Resolves the session's effective values. A parent that isn't in the
   * session takes its effective values from the source table.
   */
  #resolveSession(sessionTable: InMemSessionDataTable) {
    const { sourceTable } = sessionTable;
    const breaches = resolveEntityLimits(
      sessionTable,
      (parentKey, effectiveColumn) => {
        const value = sourceTable.getRowAtKey(parentKey, false)?.[
          sourceTable.columnMap[effectiveColumn]
        ];
        return typeof value === "number" ? value : null;
      },
    );
    const { columnMap, indexOfKeyField } = sessionTable;
    for (const row of sessionTable.rows) {
      const key = String(row[indexOfKeyField]);
      const message = breaches.get(key) ?? "";
      if (row[columnMap.vuuMsg] !== message) {
        const updated = row.slice();
        updated[columnMap.vuuMsg] = message;
        sessionTable.update(sessionTable.rowIndexAtKey(key), updated);
      }
    }
  }
}
