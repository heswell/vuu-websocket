import { Viewport } from "../../viewport/Viewport";
import { RequestContext } from "../RequestProcessor";
import { RpcResult } from "@vuu-ui/vuu-protocol-types";

export type RpcParams<T = Record<string, unknown>> = {
  namedParams: T;
  viewport: Viewport;
  ctx: RequestContext;
};
class RpcParamsImpl<T = Record<string, unknown>> {
  constructor(
    public namedParams: T,
    public viewport: Viewport,
    public ctx: RequestContext,
  ) {}
}

export function RpcParams<T = Record<string, unknown>>(
  namedParams: T,
  viewport: Viewport,
  ctx: RequestContext,
): RpcParams<T> {
  return new RpcParamsImpl<T>(namedParams, viewport, ctx);
}

export type RpcFunction = (
  params: RpcParams,
) => RpcResult | Promise<RpcResult>;
