import { RpcHandler } from "../net/rpc/RpcHandler";
import { Column } from "./TableDef";

export interface ViewPortDef {
  columns: Column[];
  service: RpcHandler;
}

export class ViewPortDefImpl {
  constructor(public columns: Column[], public service: RpcHandler) {}
}

const NoRpcHandler = new (class extends RpcHandler {})();

export const ViewPortDef = (columns: Column[], service: RpcHandler) =>
  new ViewPortDefImpl(columns, service);

ViewPortDef.default = (columns: Column[]) => ViewPortDef(columns, NoRpcHandler);
