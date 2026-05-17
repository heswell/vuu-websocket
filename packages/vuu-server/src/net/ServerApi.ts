import { VuuClientMessage, VuuServerMessage } from "@vuu-ui/vuu-protocol-types";
import { RequestContext } from "./RequestProcessor";

export interface ServerApi {
  process: (msg: VuuClientMessage, ctx: RequestContext) => VuuServerMessage;
}
