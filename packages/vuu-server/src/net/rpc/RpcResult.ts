import { RpcResultError, RpcResultSuccess } from "@vuu-ui/vuu-protocol-types";

export const RpcSuccessResult = (data: unknown): RpcResultSuccess => ({
  data,
  type: "SUCCESS_RESULT",
});

export const RpcErrorResult = (errorMessage: string): RpcResultError => ({
  errorMessage,
  type: "ERROR_RESULT",
});
