import { TableContainer } from "../../core/table/TableContainer";
import { DefaultRpcHandler } from "./DefaultRpcHandler";
import { RpcParams, RpcResult } from "./Rpc";

export class EditTableRpcHandler extends DefaultRpcHandler {
  editCell = ({
    namedParams,
    viewPortColumns,
    vpKeys,
  }: RpcParams): RpcResult => {
    console.log(`editCell ${JSON.stringify(namedParams)}`);
    return {
      type: "SUCCESS_RESULT",
      data: {},
    };
  };

  constructor(tableContainer: TableContainer) {
    super(tableContainer);
    this.registerRpc("editCell", this.editCell);
  }
}
