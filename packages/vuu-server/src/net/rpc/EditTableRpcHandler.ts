import { RpcResult, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import { TableContainer } from "../../core/table/TableContainer";
import { DefaultRpcHandler } from "./DefaultRpcHandler";
import { RpcParams } from "./Rpc";

export class EditTableRpcHandler extends DefaultRpcHandler {
  editCell = ({ namedParams, viewport, ctx }: RpcParams): RpcResult => {
    console.log(`editCell ${viewport.id} ${JSON.stringify(namedParams)}`);

    const { column, data, key } = namedParams as {
      column: string;
      data: VuuRowDataItemType;
      key: string;
    };

    if (column === "lotSize" && typeof data === "number" && data > 1000) {
      return {
        type: "ERROR_RESULT",
        errorMessage: "max valid value for lotSize is 1,000",
      };
    }

    const targetTable = viewport.dataTable;
    if (targetTable) {
      try {
        // assertUpdateIsValid(targetTable.schema, column as string, data);
        const currentRow = targetTable.getRowAtKey(key);
        if (currentRow) {
          const rowIdx = targetTable.rowIndexAtKey(key);
          const newRow = currentRow.slice();
          newRow[targetTable.columnMap[column]] = data;
          targetTable.update(rowIdx, newRow, column);
        } else {
          // TODO
        }
        return {
          type: "SUCCESS_RESULT",
          data: undefined,
        };
      } catch (e) {
        const { message } = e as Error;
        return {
          type: "ERROR_RESULT",
          errorMessage: message,
        };
      }
    } else {
      throw Error("[VuuModule] editCell unable to find table for dataSource");
    }
  };

  constructor(tableContainer: TableContainer) {
    super(tableContainer);
    this.registerRpc("editCell", this.editCell);
  }
}
