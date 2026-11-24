import {
  CreateSessionTableRpcHandler,
  RpcSuccessResult,
  type TableContainer,
  type Viewport,
} from "@heswell/vuu-server";
import type { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import type { LimitsStore } from "./LimitsStore";

export const ACTIVATE_PENDING_LIMITS = "activatePendingLimits";

/**
 * Service of viewports on the limitDefinitions table. Creates the edit,
 * import and export session tables, and activates Pending limits on
 * request, as at the start of the next business day.
 */
export class LimitsService extends CreateSessionTableRpcHandler {
  #store: LimitsStore;

  constructor(tableContainer: TableContainer, store: LimitsStore) {
    super(tableContainer);
    this.#store = store;
    this.registerRpc(ACTIVATE_PENDING_LIMITS, () => {
      store.activatePendingLimits();
      return RpcSuccessResult(undefined);
    });
  }

  /**
   * In an edit session, editChange starts with the changes already held for
   * the limit.
   */
  protected customiseRowData(
    _viewport: Viewport,
    data: Record<string, VuuRowDataItemType>,
    sourceRow: VuuDataRow,
  ) {
    const { columnMap } = this.#store.table;
    const key = String(sourceRow[columnMap.limit_key]);
    return { ...data, editChange: this.#store.describeEdit(key, "", data) };
  }
}
