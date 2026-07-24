import { VuuClientMessage, VuuServerMessage } from "@vuu-ui/vuu-protocol-types";
import { ModuleContainer } from "../core/module/ModuleContainer";
import { VuuUser } from "../core/auths/VuuUser";
import {
  ClientSessionId,
  DefaultMessageHandler,
  MessageHandler,
} from "./ClientConnectionCreator";
import { LoginTokenService } from "./auth/LoginTokenService";
import { ClientSessionContainer } from "./ClientSessionContainer";
import { ServerApi } from "./ServerApi";
import { Channel } from "./ws/Channel";
import { SessionId } from "../client/messages/ClientMessage";
import { OutboundRowPublishQueue, PublishQueue } from "../util/PublishQueue";
import { JsonViewServerMessage, LoginSuccess } from "./Messages";
import { ViewPortUpdate } from "../viewport/Viewport";
import { FlowControllerFactory } from "./flowcontrol/FlowController";

export type RequestContext = {
  queue: PublishQueue<ViewPortUpdate>;
  requestId: string;
  session: ClientSessionId;
  user: VuuUser;
};

class RequestContextImpl implements RequestContext {
  constructor(
    public requestId: string,
    public user: VuuUser,
    public session: ClientSessionId,
    public queue: PublishQueue<ViewPortUpdate>,
  ) {}
}

export const RequestContext = (
  requestId: string,
  user: VuuUser,
  session: ClientSessionId,
  queue: PublishQueue<ViewPortUpdate>,
) => new RequestContextImpl(requestId, user, session, queue);

export class RequestProcessor {
  constructor(
    private loginTokenService: LoginTokenService,
    private clientSessionContainer: ClientSessionContainer,
    private serverApi: ServerApi,
    private moduleContainer: ModuleContainer,
    private flowControllerFactory: FlowControllerFactory,
    private vuuServerId: string,
  ) {}

  handle(msg: VuuClientMessage, channel: Channel) {
    if (msg.body.type === "LOGIN") {
      try {
        const vuuUser = this.loginTokenService.login(msg.body);
        return this.createSession(
          msg.requestId,
          vuuUser,
          this.clientSessionContainer,
          channel,
          this.vuuServerId,
        );
      } catch (error) {
        return this.sendMessageAndCloseChannel(
          (error as Error).message,
          channel,
        );
      }
    } else {
      try {
        return this.handleViewServerMessage(msg, channel);
      } catch (error) {
        this.closeChannel(error as Error, channel);
      }
    }
  }

  createSession(
    requestId: string,
    user: VuuUser,
    clientSessionContainer: ClientSessionContainer,
    channel: Channel,
    vuUServerId: string,
  ): VuuServerMessage | void {
    console.log(
      `[RequestProcessor] createSession ${requestId} for user ${user.name}`,
    );
    const session = SessionId.oneNew();
    const id = ClientSessionId(session, channel.data.sessionId);
    const handler = this.createMessageHandler(channel, id, user);
    try {
      clientSessionContainer.register(user, id, handler);
      return JsonViewServerMessage(
        requestId,
        session,
        LoginSuccess(vuUServerId),
      );
    } catch (e) {
      this.sendMessageAndCloseChannel((e as Error).message, channel);
    }
  }

  private createMessageHandler = (
    channel: Channel,
    sessionId: ClientSessionId,
    user: VuuUser,
  ) =>
    DefaultMessageHandler(
      channel,
      new OutboundRowPublishQueue(),
      user,
      sessionId,
      this.serverApi,
      this.flowControllerFactory.create(sessionId),
      this.clientSessionContainer,
      this.moduleContainer,
    );

  private handleViewServerMessage(msg: VuuClientMessage, channel: Channel) {
    // console.log(
    //   `[RequestProcessor] handleViewServerMessage ${JSON.stringify(msg)}`,
    // );
    const sessionId = this.msgToSessionId(msg, channel);
    const handler = this.clientSessionContainer.getHandler(sessionId);
    if (handler) {
      return handler.handle(msg);
    } else {
      return this.handleMessageWithInvalidSession(sessionId, channel);
    }
  }

  private msgToSessionId = (msg: VuuClientMessage, channel: Channel) =>
    ClientSessionId(msg.sessionId, channel.data.sessionId);

  private handleMessageWithInvalidSession(
    requestSession: ClientSessionId,
    channel: Channel,
  ) {
    this.sendMessageAndCloseChannel(
      `Invalid session ${requestSession.sessionId}`,
      channel,
    );
  }

  private closeChannel(e: Error, channel: Channel) {
    console.error(e);
    console.error(
      `[RequestProcessor] Internal server error. sessionId: ${channel.data.sessionId}`,
    );
    this.sendMessageAndCloseChannel("Internal server error", channel);
  }

  private sendMessageAndCloseChannel(msg: string, channel: Channel) {
    channel.send(msg);
    channel.close();
  }
}
