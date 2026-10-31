import { VuuClientMessage } from "@vuu-ui/vuu-protocol-types";
import { ModuleContainer } from "../core/module/ModuleContainer";
import { VuuUser } from "../core/auths/VuuUser";
import {
  ClientSessionId,
  DefaultMessageHandler,
  MessageHandler,
} from "./ClientConnectionCreator";
import type { LoginTokenService } from "./auth/LoginTokenService";
import { ClientSessionContainer } from "./ClientSessionContainer";
import { ServerApi } from "./ServerApi";
import { Channel } from "./ws/Channel";
import { SessionId } from "../client/messages/ClientMessage";
import { OutboundRowPublishQueue, PublishQueue } from "../util/PublishQueue";
import {
  ErrorResponse,
  JsonViewServerMessage,
  LoginSuccess,
  type ViewServerMessage,
} from "./Messages";
import { ViewPortUpdate } from "../viewport/Viewport";
import { FlowControllerFactory } from "./flowcontrol/FlowController";
import type { LoginSuccessOptions } from "./LoginSuccess";
import { getLogger } from "@heswell/service-utils/browser";
import { errorMessage, isClientRequestError } from "./ClientRequestError";
import { SessionLimitError } from "./ClientSessionContainer";
import { VuuCloseCode } from "./CloseCodes";

const log = getLogger("vuu.session");

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
): RequestContext => new RequestContextImpl(requestId, user, session, queue);

export class RequestProcessor {
  constructor(
    private loginTokenService: LoginTokenService,
    private clientSessionContainer: ClientSessionContainer,
    private serverApi: ServerApi,
    private moduleContainer: ModuleContainer,
    private flowControllerFactory: FlowControllerFactory,
    private vuuServerId: string,
    private loginSuccessProvider?: (user: VuuUser) => LoginSuccessOptions,
  ) {}

  /**
   * Never rejects. A request that fails is logged and answered with an
   * ERROR message; the session stays open.
   */
  async handle(
    msg: VuuClientMessage,
    channel: Channel,
  ): Promise<ViewServerMessage | void> {
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
        log.warn(`login refused on channel ${channel.data.sessionId}: ${errorMessage(error)}`);
        return this.sendMessageAndCloseChannel(
          errorMessage(error),
          channel,
          VuuCloseCode.LoginFailed,
        );
      }
    } else {
      try {
        return await this.handleViewServerMessage(msg, channel);
      } catch (error) {
        return this.errorResponse(msg, error, channel);
      }
    }
  }

  /** Channel closed by the client or the network: tear down its sessions. */
  channelClosed(channel: Channel) {
    this.clientSessionContainer.removeChannel(channel.data.sessionId);
  }

  createSession(
    requestId: string,
    user: VuuUser,
    clientSessionContainer: ClientSessionContainer,
    channel: Channel,
    vuUServerId: string,
  ): ViewServerMessage | void {
    log.debug(
      `createSession ${requestId} for user ${user.name}`,
    );
    const session = SessionId.oneNew();
    const id = ClientSessionId(session, channel.data.sessionId);
    const handler = this.createMessageHandler(channel, id, user);
    try {
      const loginSuccessOptions = this.loginSuccessProvider?.(user);
      clientSessionContainer.register(user, id, handler);
      return JsonViewServerMessage(
        requestId,
        session,
        LoginSuccess(vuUServerId, loginSuccessOptions),
      );
    } catch (e) {
      this.sendMessageAndCloseChannel(
        errorMessage(e),
        channel,
        e instanceof SessionLimitError
          ? VuuCloseCode.SessionLimitReached
          : VuuCloseCode.LoginFailed,
      );
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

  private async handleViewServerMessage(
    msg: VuuClientMessage,
    channel: Channel,
  ) {
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
    log.warn(
      `message for invalid session ${requestSession.sessionId} on channel ${channel.data.sessionId}, closing channel`,
    );
    this.sendMessageAndCloseChannel(
      `Invalid session ${requestSession.sessionId}`,
      channel,
      VuuCloseCode.InvalidSession,
    );
  }

  private errorResponse(
    msg: VuuClientMessage,
    error: unknown,
    channel: Channel,
  ): ViewServerMessage {
    const where = `${msg.body?.type} (${msg.requestId}, session ${msg.sessionId}, channel ${channel.data.sessionId})`;
    let reason: string;
    if (isClientRequestError(error)) {
      log.warn(`${where} refused: ${error.reason}`);
      reason = error.reason;
    } else {
      log.error(`${where} failed`, error);
      reason = `Failed to process request ${msg.requestId}`;
    }
    return JsonViewServerMessage(
      msg.requestId,
      msg.sessionId,
      ErrorResponse(reason),
    );
  }

  private sendMessageAndCloseChannel(
    msg: string,
    channel: Channel,
    code?: number,
  ) {
    channel.send(msg);
    channel.close(code, msg.slice(0, 120));
  }
}
