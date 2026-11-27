import {
  CreateSessionTableRpcHandler,
  type RpcParams,
  type TableContainer,
} from "@heswell/vuu-server";
import type { RpcResult } from "@vuu-ui/vuu-protocol-types";
import { ownValuesBelow } from "./entityLimits";

/** The RPC that lists the rows below a row that set their own value. */
export const GET_OWN_VALUES_BELOW = "getOwnValuesBelow";

/**
 * Service of viewports on the entityLimits table. As well as edit sessions,
 * getOwnValuesBelow {key, column} lists the rows below a row, at any depth,
 * that set their own value in a column, as [{key, value}].
 */
export class EntityLimitsService extends CreateSessionTableRpcHandler {
  constructor(tableContainer: TableContainer) {
    super(tableContainer);
    this.registerRpc(GET_OWN_VALUES_BELOW, this.getOwnValuesBelow);
  }

  getOwnValuesBelow = ({ namedParams, viewport }: RpcParams): RpcResult => {
    const { column, key } = namedParams as { column?: string; key?: string };
    if (typeof column !== "string" || typeof key !== "string") {
      return {
        type: "ERROR_RESULT",
        errorMessage: `${GET_OWN_VALUES_BELOW} needs a key and a column`,
      };
    }
    const { dataTable } = viewport;
    if (dataTable.columnMap[column] === undefined) {
      return {
        type: "ERROR_RESULT",
        errorMessage: `${GET_OWN_VALUES_BELOW}: no column ${column}`,
      };
    }
    return {
      type: "SUCCESS_RESULT",
      data: ownValuesBelow(dataTable, key, column),
    };
  };
}
