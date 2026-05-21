import { RpcResult } from "@vuu-ui/vuu-protocol-types";
import { TableContainer } from "../../core/table/TableContainer";
import { DefaultRpcHandler } from "./DefaultRpcHandler";
import { RpcParams } from "./Rpc";

export class EditTableRpcHandler extends DefaultRpcHandler {
  editCell = ({ namedParams, viewport, ctx }: RpcParams): RpcResult => {
    console.log(`editCell ${JSON.stringify(namedParams)}`);
    return {
      type: "SUCCESS_RESULT",
      data: {},
    };
  };

  constructor(tableContainer: TableContainer) {
    super(tableContainer);
    console.log(`rpc service available: editCell`);
    this.registerRpc("editCell", this.editCell);
  }
}
