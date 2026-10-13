import {
  ServerToClientTableRows,
  VuuClientMessage,
  VuuDataRow,
} from "@vuu-ui/vuu-protocol-types";
import { Channel } from "./ws/Channel";
import { PublishQueue } from "../util/PublishQueue";
import { isViewPortRowUpdate, ViewPortUpdate } from "../viewport/Viewport";
import { VuuUser } from "../core/auths/VuuUser";
import { ServerApi } from "./ServerApi";
import { ClientSessionContainer } from "./ClientSessionContainer";
import { ModuleContainer } from "../core/module/ModuleContainer";
import { RequestContext } from "./RequestProcessor";
import {
  HeartBeat,
  JsonViewServerMessage,
  TableRowUpdates,
  type ViewServerMessage,
} from "./Messages";
import { RequestId } from "../client/messages/ClientMessage";
import { RowUpdate } from "./row/RowUpdate";
import { RowUpdateType } from "./row/RowUpdateType";
import { withinRange } from "@vuu-ui/vuu-utils";
import {
  Disconnect,
  FlowController,
  SendHeartbeat,
} from "./flowcontrol/FlowController";
import { getLogger } from "@heswell/service-utils";
import { ClientRequestError } from "./ClientRequestError";
import { VuuCloseCode } from "./CloseCodes";

const log = getLogger("vuu.session");

const EMPTY_ROW: VuuDataRow = [];
interface InboundMessageHandler {
  handle: (
    msg: VuuClientMessage,
  ) => ViewServerMessage | Promise<ViewServerMessage | void> | void;
}

interface OutboundMessageHandler {
  sendUpdates: () => void;
}

export interface MessageHandler
  extends InboundMessageHandler, OutboundMessageHandler {
  /**
   * Tears down the session: removes its viewports and session tables and
   * closes its channel (with code and reason, if given). Idempotent.
   */
  close?: (code?: number, reason?: string) => void;
}

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
  ) {}

  #closed = false;

  handle = async (msg: VuuClientMessage) => {
    if (this.#closed) {
      throw new ClientRequestError(
        `session ${this.session.sessionId} is closed`,
      );
    }
    const ctx = RequestContext(
      msg.requestId,
      this.user,
      this.session,
      this.outboundQueue,
    );

    this.flowController.process(msg);

    const response = await this.serverApi.process(msg, ctx);
    if (this.#closed) {
      // the session was closed while the request was in flight, remove
      // anything it created
      this.serverApi.disconnect(this.session);
      return;
    }
    return response;
  };

  close = (code?: number, reason?: string) => {
    if (this.#closed) return;
    this.#closed = true;
    log.debug(
      `closing session ${this.session.sessionId}${reason ? `, ${reason}` : ""}`,
    );
    try {
      this.serverApi.disconnect(this.session);
    } catch (error) {
      log.error(
        `failed to clean up session ${this.session.sessionId}`,
        error,
      );
    }
    this.channel.close(code, reason);
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
    const ts = performance.now();
    const updates: RowUpdate[] = [];
    for (let i = 0; i < outbound.length; i++) {
      const vpu = outbound[i];
      if (vpu.vpRequestId === vpu.vp.requestId) {
        const update = this.formatOneRowUpdate(vpu, ts);
        if (update !== undefined) updates.push(update);
      }
    }

    const updateId = RequestId.oneNew();

    return TableRowUpdates(updateId, true, Date.now(), updates);
  }

  /**
   * vpSize is taken from the viewport at send time, not from the queued entry.
   * The queue merges updates in place, so queued sizes are not in
   * chronological order; using the current size keeps every update in a
   * message consistent and never regresses the client's size.
   */
  private formatOneRowUpdate(
    update: ViewPortUpdate,
    ts: number,
  ): RowUpdate | undefined {
    const vpSize = update.vp.size;
    if (isViewPortRowUpdate(update)) {
      //if viewport has changed while we're processing the queue
      if (
        update.index >= vpSize ||
        !withinRange(update.index, update.vp.range)
      ) {
        return undefined;
      }
      const { data, rowKey, sel } = update;
      return RowUpdate(
        update.vpRequestId,
        update.vp.id,
        vpSize,
        update.index,
        rowKey,
        RowUpdateType.Update,
        ts,
        sel,
        data,
      );
    } else {
      return RowUpdate(
        update.vpRequestId,
        update.vp.id,
        vpSize,
        update.index,
        update.rowKey,
        RowUpdateType.SizeOnly,
        ts,
        0,
        EMPTY_ROW,
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
    log.debug(`Disconnecting session ${this.session.sessionId}`);
    this.sessionContainer.remove(this.user, this.session);
    this.close(VuuCloseCode.HeartbeatTimeout, "heartbeat timeout");
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
  ) {}

  toString() {
    return `sessionId: ${this.sessionId}, channelId: ${this.channelId}`;
  }
}

export const ClientSessionId = (
  sessionId: string,
  channelId: string,
): ClientSessionId => new ClientSessionIdImpl(sessionId, channelId);
