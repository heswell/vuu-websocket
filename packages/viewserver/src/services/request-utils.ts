import { ClientToServerRpcRequest, VuuTable } from "@vuu-ui/vuu-protocol-types";

type UniqueValueRequest = Pick<ClientToServerRpcRequest, "type" | "service"> & {
  method: "getUniqueFieldValues";
  params: [VuuTable, string];
};

type UniqueValueStartsWithRequest = Pick<
  ClientToServerRpcRequest,
  "type" | "service"
> & {
  method: "getUniqueFieldValuesStartingWith";
  params: [VuuTable, string, string];
};

export const isGetUniqueValues = (
  message: ClientToServerRpcRequest
): message is UniqueValueRequest =>
  message.method === "getUniqueFieldValues" && message.params.length === 2;

export const isGetUniqueValuesStartingWith = (
  message: ClientToServerRpcRequest
): message is UniqueValueStartsWithRequest =>
  message.method === "getUniqueFieldValuesStartingWith" &&
  message.params.length === 3;
