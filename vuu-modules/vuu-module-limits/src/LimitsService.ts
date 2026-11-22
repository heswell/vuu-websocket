import {
  CreateSessionTableRpcHandler,
  RpcSuccessResult,
  type TableContainer,
} from "@heswell/vuu-server";
import type { LimitsStore } from "./LimitsStore";

export const ACTIVATE_PENDING_LIMITS = "activatePendingLimits";

/**
 * Service of viewports on the limitDefinitions table. Creates the edit,
 * import and export session tables, and activates Pending limits on
 * request, as at the start of the next business day.
 */
export class LimitsService extends CreateSessionTableRpcHandler {
  constructor(tableContainer: TableContainer, store: LimitsStore) {
    super(tableContainer);
    this.registerRpc(ACTIVATE_PENDING_LIMITS, () => {
      store.activatePendingLimits();
      return RpcSuccessResult(undefined);
    });
  }
}
