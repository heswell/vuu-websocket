import {
  ServerToClientTableRows,
  VuuClientMessage,
  VuuServerMessage,
} from "@vuu-ui/vuu-protocol-types";
import { Channel } from "./ws/Channel";
import { PublishQueue } from "../util/PublishQueue";
import { isViewPortRowUpdate, ViewPortUpdate } from "../viewport/Viewport";
import { VuuUser } from "../core/auths/VuuUser";
import { ServerApi } from "./ServerApi";
import { ClientSessionContainer } from "./ClientSessionContainer";
import { ModuleContainer } from "../core/module/ModuleContainer";
import { RequestContext } from "./RequestProcessor";
import { HeartBeat, JsonViewServerMessage, TableRowUpdates } from "./Messages";
import { RequestId } from "../client/messages/ClientMessage";
import { RowUpdate } from "./row/RowUpdate";
import { RowUpdateType } from "./row/RowUpdateType";
import { withinRange } from "@vuu-ui/vuu-utils";
import {
  Disconnect,
  FlowController,
  SendHeartbeat,
} from "./flowcontrol/FlowController";

const EMPTY_ARRAY = [] as const;
interface InboundMessageHandler {
  handle: (
    msg: VuuClientMessage,
  ) => VuuServerMessage | Promise<VuuServerMessage | void> | void;
}

interface OutboundMessageHandler {
  sendUpdates: () => void;
}

export interface MessageHandler
  extends InboundMessageHandler, OutboundMessageHandler { }

class DefaultMessageHandlerImpl implements MessageHandler {
  constructor(
    private channel: Channel,
    private outboundQueue: PublishQueue<ViewPortUpdate>,
    private user: VuuUser,
    private session: ClientSessionId,
    private serverApi: ServerApi,
    private flowController: FlowController,
    private sessionContainer: ClientSessionContainer,
    private moduleContainer: ModuleContainer,
  ) { }
  handle = async (msg: VuuClientMessage) => {


    const ctx = RequestContext(
      msg.requestId,
      this.user,
      this.session,
      this.outboundQueue,
    );

    this.flowController.process(msg);

    return this.serverApi.process(msg, ctx);
  };

  private sendUpdatesInternal(updates: ViewPortUpdate[], highPriority = false) {
    if (updates.length) {
      // console.log(`ASYNC-SVR-OUT: Sending ${updates.length} updates`);

      const formatted = this.formatDataOutbound(updates);

      const json = JSON.stringify(
        JsonViewServerMessage("", this.session.sessionId, formatted),
      );

      // console.log(`ASYNC-SVR-OUT: ${json}`);

      this.channel.send(json);
    }
  }

  private formatDataOutbound(
    outbound: ViewPortUpdate[],
  ): ServerToClientTableRows {
    const updates = outbound
      .flatMap((vpu) =>
        vpu.vpRequestId === vpu.vp.requestId
          ? this.formatOneRowUpdate(vpu)
          : undefined,
      )
      .filter((vpu) => vpu !== undefined);

    const updateId = RequestId.oneNew();

    return TableRowUpdates(updateId, true, Date.now(), updates);
  }

  private formatOneRowUpdate(update: ViewPortUpdate): RowUpdate | undefined {
    if (isViewPortRowUpdate(update)) {
      //if viewport has changed while we're processing the queue
      if (!withinRange(update.index, update.vp.range)) {
        return undefined;
      }

      const dataToSend = update.table.pullRowAsArray(
        update.key.key,
        update.vp.columns,
      );

      const isSelected = update.vp.selectedKeys.has(update.key.key) ? 1 : 0;

      if (dataToSend.length == 0) {
        return undefined;
      } else {
        return RowUpdate(
          update.vpRequestId,
          update.vp.id,
          update.size,
          update.index,
          update.key.key,
          RowUpdateType.Update,
          performance.now(),
          isSelected,
          dataToSend,
        );
      }
    } else {
      console.log(`SVR[VP] Size: vpid=${update.vp.id} size=${update.vp.size}`);
      return RowUpdate(
        update.vpRequestId,
        update.vp.id,
        update.size,
        update.index,
        update.key.key,
        RowUpdateType.SizeOnly,
        performance.now(),
        0,
        EMPTY_ARRAY,
      );
    }
  }

  sendUpdates = () => {
    const flowControllerOp = this.flowController.shouldSend();
    if (flowControllerOp === SendHeartbeat) {
      // console.log(
      //   `[SESSION] Sending heartbeat to session ${this.session.sessionId}`,
      // );
      const json = JSON.stringify(
        JsonViewServerMessage(
          "",
          this.session.sessionId,
          HeartBeat(Date.now()),
        ),
      );
      this.channel.send(json);
    } else if (flowControllerOp === Disconnect) {
      return this.disconnect();
    } else if (flowControllerOp.type === "BATCHSIZE") {
      const updates = this.outboundQueue.popUpTo(flowControllerOp.size);
      this.sendUpdatesInternal(updates);
    }
  };

  private disconnect() {
    console.log(`[SESSION] Disconnecting session ${this.session.sessionId}`);
    this.serverApi.disconnect(this.session);
    this.sessionContainer.remove(this.user, this.session);
    this.channel.close();
  }
}

export function DefaultMessageHandler(
  channel: Channel,
  outboundQueue: PublishQueue<ViewPortUpdate>,
  user: VuuUser,
  session: ClientSessionId,
  serverAPi: ServerApi,
  flowController: FlowController,
  sessionContainer: ClientSessionContainer,
  moduleContainer: ModuleContainer,
): MessageHandler {
  return new DefaultMessageHandlerImpl(
    channel,
    outboundQueue,
    user,
    session,
    serverAPi,
    flowController,
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
  ) { }

  toString() {
    return `sessionId: ${this.sessionId}, channelId: ${this.channelId}`;
  }
}

export const ClientSessionId = (
  sessionId: string,
  channelId: string,
): ClientSessionId => new ClientSessionIdImpl(sessionId, channelId);
