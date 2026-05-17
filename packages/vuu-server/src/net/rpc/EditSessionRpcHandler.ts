import { TableContainer } from "../../core/table/TableContainer";
import { EditTableRpcHandler } from "./EditTableRpcHandler";
import { RpcParams, RpcResult } from "./Rpc";

export class EditSessionRpcHandler extends EditTableRpcHandler {
  enterEditMode = ({
    namedParams,
    params,
    viewPortColumns,
    vpKeys,
  }: RpcParams): RpcResult => {
    console.log(
      `ENTER_EDIT_MODE ${JSON.stringify(namedParams)} ${JSON.stringify(params)}`,
    );
    return {
      type: "SUCCESS_RESULT",
      data: {},
    };
  };

  constructor(tableContainer: TableContainer) {
    super(tableContainer);
    this.registerRpc("ENTER_EDIT_MODE", this.enterEditMode);
  }
}
