import { VuuClientMessage, VuuServerMessage } from "@vuu-ui/vuu-protocol-types";
import { Channel } from "./ws/Channel";
import { PublishQueue } from "../util/PublishQueue";
import { ViewPortUpdate } from "../viewport/Viewport";
import { VuuUser } from "../core/auths/VuuUser";
import { ServerApi } from "./ServerApi";
import { ClientSessionContainer } from "./ClientSessionContainer";
import { ModuleContainer } from "../core/module/ModuleContainer";
import { RequestContext } from "./RequestProcessor";

interface InboundMessageHandler {
  handle: (msg: VuuClientMessage) => VuuServerMessage;
}

interface OutboundMessageHandler {
  sendUpdates: () => void;
}

export interface MessageHandler
  extends InboundMessageHandler, OutboundMessageHandler {}

class DefaultMessageHandlerImpl implements MessageHandler {
  constructor(
    private channel: Channel,
    private outboundQueue: PublishQueue<ViewPortUpdate>,
    private user: VuuUser,
    private session: ClientSessionId,
    private serverApi: ServerApi,
    // flowController
    private sessionContainer: ClientSessionContainer,
    private moduleContainer: ModuleContainer,
  ) {}
  handle = (msg: VuuClientMessage) => {
    console.log(`[DefaultMessageHandler] handle ${JSON.stringify(msg)}`);

    const ctx = RequestContext(
      msg.requestId,
      this.user,
      this.session,
      this.outboundQueue,
    );

    // flowController.process(msg) sets last time

    return this.serverApi.process(msg, ctx);
  };
  sendUpdates = () => {
    console.log(`[DefaultMessageHandler] sendUpdates`);
  };
}

export function DefaultMessageHandler(
  channel: Channel,
  outboundQueue: PublishQueue<ViewPortUpdate>,
  user: VuuUser,
  session: ClientSessionId,
  serverAPi: ServerApi,
  // flowController
  sessionContainer: ClientSessionContainer,
  moduleContainer: ModuleContainer,
): MessageHandler {
  return new DefaultMessageHandlerImpl(
    channel,
    outboundQueue,
    user,
    session,
    serverAPi,
    sessionContainer,
    moduleContainer,
  );
}

export type ClientSessionId = {
  sessionId: string;
  channelId: string;
};

class ClientSessionIdImpl implements ClientSessionId {
  constructor(
    public sessionId: string,
    public channelId: string,
  ) {}

  toString() {
    return `sessionId: ${this.sessionId}, channelId: ${this.channelId}`;
  }
}

export const ClientSessionId = (
  sessionId: string,
  channelId: string,
): ClientSessionId => new ClientSessionIdImpl(sessionId, channelId);
