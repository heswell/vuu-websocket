import { RequestProcessor } from "./RequestProcessor";
import { ModuleContainer } from "../core/module/ModuleContainer";
import { ClientSessionContainer } from "./ClientSessionContainer";
import { ServerApi } from "./ServerApi";
import { VuuClientMessage } from "@vuu-ui/vuu-protocol-types";
import { Channel } from "./ws/Channel";
import { LoginTokenService } from "./auth/LoginTokenService";
import { FlowControllerFactory } from "./flowcontrol/FLowController";

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
  ) {}

  create() {
    const requestProcessor = new RequestProcessor(
      this.loginTokenService,
      this.sessionContainer,
      this.serverApi,
      this.moduleContainer,
      this.flowControllerFactory,
      this.vuuServerId,
    );
    return new ViewServerHandler(requestProcessor);
  }
}

export class ViewServerHandler {
  constructor(private processor: RequestProcessor) {}

  close() {
    console.log("closing session on disconnect");
  }

  handle(inbound: string, channel: Channel) {
    // console.log(`[ViewServerHandler] handle inbound ${inbound}`);
    const viewServerMessage = JSON.parse(inbound) as VuuClientMessage;
    const response = this.processor.handle(viewServerMessage, channel);
    if (response) {
      const serializedResponse = JSON.stringify(response);
      // console.log(`[ViewServerHandler] send outbound  ${serializedResponse}`);
      channel.send(serializedResponse);
    }
  }
}
