import { VuuClientMessage } from "@vuu-ui/vuu-protocol-types";
import type { ViewServerMessage } from "./Messages";
import { ClientSessionId } from "./ClientConnectionCreator";
import { RequestContext } from "./RequestProcessor";

export interface ServerApi {
  process: (
    msg: VuuClientMessage,
    ctx: RequestContext,
  ) => ViewServerMessage | Promise<ViewServerMessage | void> | void;
  disconnect: (session: ClientSessionId) => void;
}
