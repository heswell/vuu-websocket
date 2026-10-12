import { RpcResultError, RpcResultSuccess } from "@vuu-ui/vuu-protocol-types";

export const RpcSuccessResult = (data: unknown): RpcResultSuccess => ({
  data,
  type: "SUCCESS_RESULT",
});

/**
 * Error result that can carry a payload back to the client alongside the
 * message (the protocol type has no data field).
 */
export type RpcResultErrorWithData = RpcResultError & { data?: unknown };

export const RpcErrorResult = (
  errorMessage: string,
  data?: unknown,
): RpcResultErrorWithData => ({
  data,
  errorMessage,
  type: "ERROR_RESULT",
});
