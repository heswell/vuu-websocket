import { RpcResultError, RpcResultSuccess } from "@vuu-ui/vuu-protocol-types";

export const RpcSuccessResult = (data: unknown): RpcResultSuccess => ({
  data,
  type: "SUCCESS_RESULT",
});

export const RpcErrorResult = (
  errorMessage: string,
  data?: unknown,
): RpcResultError => ({
  data,
  errorMessage,
  type: "ERROR_RESULT",
});
