import { SortSet } from "@heswell/data";
import { Column } from "../../api/TableDef";

export class RpcParams<T = Record<string, unknown>> {
  constructor(
    public params: unknown[],
    public namedParams: T,
    public viewPortColumns?: Column[],
    public vpKeys?: number[] | SortSet
  ) {}
}

export type RpcResult = {};
export type RpcFunction = (params: RpcParams) => RpcResult;
