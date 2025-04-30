import { VuuRpcServiceRequest, VuuTable } from "@vuu-ui/vuu-protocol-types";

type UniqueValueRequest = Pick<VuuRpcServiceRequest, "type" | "service"> & {
  method: "getUniqueFieldValues";
  params: [VuuTable, string];
};

type UniqueValueStartsWithRequest = Pick<
  VuuRpcServiceRequest,
  "type" | "service"
> & {
  method: "getUniqueFieldValuesStartingWith";
  params: [VuuTable, string, string];
};

export const isGetUniqueValues = (
  message: VuuRpcServiceRequest
): message is UniqueValueRequest =>
  message.method === "getUniqueFieldValues" && message.params.length === 2;

export const isGetUniqueValuesStartingWith = (
  message: VuuRpcServiceRequest
): message is UniqueValueStartsWithRequest =>
  message.method === "getUniqueFieldValuesStartingWith" &&
  message.params.length === 3;
