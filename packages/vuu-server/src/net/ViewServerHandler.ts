import { RequestProcessor } from "./RequestProcessor";
import { ModuleContainer } from "../core/module/ModuleContainer";
import { ClientSessionContainer } from "./ClientSessionContainer";
import { ServerApi } from "./ServerApi";
import { VuuClientMessage } from "@vuu-ui/vuu-protocol-types";
import { Channel } from "./ws/Channel";
import { LoginTokenService } from "./auth/LoginTokenService";
import { FlowControllerFactory } from "./flowcontrol/FlowController";
import type { VuuUser } from "../core/auths/VuuUser";
import type { LoginSuccessOptions } from "./LoginSuccess";
import { getLogger } from "@heswell/service-utils";
import { ErrorResponse, JsonViewServerMessage } from "./Messages";

const log = getLogger("vuu.session");

export interface ViewServerHandlerFactory {
  create: () => ViewServerHandler;
}

export class ViewServerHandlerFactoryImpl implements ViewServerHandlerFactory {
  constructor(
    private loginTokenService: LoginTokenService,
    private sessionContainer: ClientSessionContainer,
    private serverApi: ServerApi,
    private moduleContainer: ModuleContainer,
    private flowControllerFactory: FlowControllerFactory,
    private vuuServerId: string,
    private loginSuccessProvider?: (user: VuuUser) => LoginSuccessOptions,
  ) {}

  create() {
    const requestProcessor = new RequestProcessor(
      this.loginTokenService,
      this.sessionContainer,
      this.serverApi,
      this.moduleContainer,
      this.flowControllerFactory,
      this.vuuServerId,
      this.loginSuccessProvider,
    );
    return new ViewServerHandler(requestProcessor);
  }
}

export class ViewServerHandler {
  constructor(private processor: RequestProcessor) {}

  /** The channel has closed: tear down any session opened on it. */
  close(channel?: Channel) {
    log.debug("closing session on disconnect");
    if (channel) {
      this.processor.channelClosed(channel);
    }
  }

  /** Never rejects, see RequestProcessor.handle. */
  async handle(inbound: string, channel: Channel) {
    let viewServerMessage: VuuClientMessage;
    try {
      viewServerMessage = JSON.parse(inbound) as VuuClientMessage;
      if (typeof viewServerMessage?.body?.type !== "string") {
        throw Error("message has no body.type");
      }
    } catch (error) {
      log.warn(
        `invalid message on channel ${channel.data.sessionId}: ${(error as Error).message}`,
      );
      channel.send(
        JSON.stringify(
          JsonViewServerMessage("", "", ErrorResponse("invalid message")),
        ),
      );
      return;
    }
    const response = await this.processor.handle(viewServerMessage, channel);
    if (response) {
      channel.send(JSON.stringify(response));
    }
  }
}
