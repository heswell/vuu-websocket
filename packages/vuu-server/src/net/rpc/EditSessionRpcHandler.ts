import { TableContainer } from "../../core/table/TableContainer";
import { CreateSessionTableRpcHandler } from "./CreateSessionTableRpcHandler";

export type {
  EditSessionMode,
  SessionTableCopyOption,
} from "./CreateSessionTableRpcHandler";

/**
 * @deprecated Extend CreateSessionTableRpcHandler instead.
 */
export class EditSessionRpcHandler extends CreateSessionTableRpcHandler {
  constructor(tableContainer: TableContainer) {
    super(tableContainer);
  }
}
