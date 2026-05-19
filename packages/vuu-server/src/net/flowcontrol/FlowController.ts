import { VuuClientMessage, VuuServerMessage } from "@vuu-ui/vuu-protocol-types";
import { ClientSessionId } from "../ClientConnectionCreator";

type BatchSize = {
  type: "BATCHSIZE";
  size: number;
};

const BatchSize = (size: number): BatchSize => ({
  type: "BATCHSIZE",
  size,
});

export const Disconnect = {
  type: "DISCONNECT" as const,
};

export const SendHeartbeat = {
  type: "SEND_HEARTBEAT" as const,
};

type SendHeartbeat = typeof SendHeartbeat;
type Disconnect = typeof Disconnect;

export type FlowControlOp = SendHeartbeat | BatchSize | Disconnect;

export interface FlowController {
  process: (msg: VuuClientMessage) => void;
  shouldSend: () => FlowControlOp;
}

export class FlowControllerFactory {
  constructor(private hasHeartBeat = true) {}

  create(sessionId: ClientSessionId) {
    if (this.hasHeartBeat) {
      return new DefaultFlowController(sessionId);
    } else {
      return new NoHeartbeatFlowController();
    }
  }
}

class DefaultFlowController implements FlowController {
  #lastMsgTime = -1;
  #lastHeartBeatSentTime = -1;

  constructor(private sessionId: ClientSessionId) {}

  process() {
    this.#lastMsgTime = performance.now();
  }

  shouldSend() {
    const currentTime = performance.now();
    const timeSinceLastMessage =
      this.#lastMsgTime === -1 ? -1 : currentTime - this.#lastMsgTime;
    const timeSinceLastHeartbeat = currentTime - this.#lastHeartBeatSentTime;

    if (
      this.shouldSendHeartbeat(timeSinceLastMessage, timeSinceLastHeartbeat)
    ) {
      return this.sendHeartbeat();
    } else if (this.shouldDisconnect(timeSinceLastMessage)) {
      console.warn(
        `[SESSION] Disconnecting session ${this.sessionId.sessionId} because it has not responded for ${timeSinceLastMessage}ms`,
      );
      return Disconnect;
    } else {
      return BatchSize(300);
    }
  }

  private shouldSendHeartbeat(
    timeSinceLastMessage: number,
    timeSinceLastHeartbeat: number,
  ) {
    if (timeSinceLastMessage == -1) return true;
    else if (timeSinceLastHeartbeat < 1_000) return false;
    else {
      if (timeSinceLastMessage > 10_000 && timeSinceLastMessage <= 15_000) {
        console.warn(
          `[SESSION] Session ${this.sessionId.sessionId} has not responded for ${timeSinceLastMessage}ms`,
        );
      }
      return timeSinceLastMessage > 5_000 && timeSinceLastMessage <= 15_000;
    }
  }

  private sendHeartbeat() {
    this.#lastHeartBeatSentTime = performance.now();
    return SendHeartbeat;
  }

  private shouldDisconnect(timeSinceLastMessage: number) {
    return timeSinceLastMessage > 15_000;
  }
}

class NoHeartbeatFlowController implements FlowController {
  process(msg: VuuServerMessage) {
    // nothing to do
  }
  shouldSend = () => BatchSize(300);
}
