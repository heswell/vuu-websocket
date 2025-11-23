import type {
  ServerMessageBody,
  VuuLoginRequest,
  VuuLoginSuccessResponse,
} from "@vuu-ui/vuu-protocol-types";
import { ServerWebSocket } from "bun";
import logger from "../logger.ts";
import { MessageQueue } from "../messageQueue.ts";
import type { WebsocketData } from "../server.ts";
import type { ISession } from "../server-types.ts";

// TODO use SessionContainer
const sessions = new Map<string, ISession>();

let messageCountPerSecond = 0;

export const startHeartbeats = (updateFrequency = 10000) => {
  return heartbeatLoop(updateFrequency);
};

export const startMainUpdateLoop = (updateFrequency = 250) => {
  console.log(`update frequency ${updateFrequency}`);
  return updateLoop("Regular Updates", updateFrequency);
};

export function heartbeatLoop(interval: number) {
  console.log(`===> starting heartbeat loop @  ${interval}`);

  let _keepGoing = true;
  let _timer: Timer | null = null;

  const tick = () => {
    console.log(`[heartbeatLoop] tick (${sessions.size} sessions)`);
    const ts = Date.now();
    const expiredSessions: ISession[] = [];
    for (const session of sessions.values()) {
      if (session.clientUnresponsive) {
        console.log(
          `[heartbeatLoop] session #${session.id} received no heartbeat response from client`
        );
        expiredSessions.push(session);
      } else {
        session.outgoingHeartbeat = ts;
        session.ws.send(
          `{"requestId":"NA","sessionId":"${session.id}","user":"","token":"","body":{"type":"HB", "ts": ${ts} }}`
        );
      }
    }

    expiredSessions.forEach((session) => {
      session.kill();
      clearSession(session.id);
    });

    if (_keepGoing) {
      _timer = setTimeout(tick, interval);
    }
  };

  tick();

  function stopper() {
    console.log(`[VUU:net:SessionContainer] stopping heartbeat updateLoop`);
    if (_timer) {
      clearTimeout(_timer);
    }
    _keepGoing = false;
  }

  return stopper;
}

export function updateLoop(name: string, interval: number) {
  let _keepGoing = true;
  let _timer: Timer | null = null;

  const tick = () => {
    // console.log(`update loops tick (${sessions.size} sessions)`);
    const start = performance.now();
    for (const session of sessions.values()) {
      const queuedMessages = session.dequeueAllMessages();
      if (Array.isArray(queuedMessages)) {
        for (const message of queuedMessages) {
          if (typeof message === "string") {
            session.ws.send(message);
          } else {
            const str = JSON.stringify(message);
            session.ws.send(str);
          }
          messageCountPerSecond += 1;
        }
      } else if (typeof queuedMessages === "string") {
        session.ws.send(queuedMessages);
        messageCountPerSecond += 1;
      }
    }
    if (_keepGoing) {
      _timer = setTimeout(tick, interval);
    }
  };

  tick();

  function stopper() {
    console.log(`stopping updateLoop ${name}`);
    if (_timer) {
      clearTimeout(_timer);
    }
    _keepGoing = false;
  }

  return stopper;
}

export const createSession = (
  sessionId: string,
  ws: ServerWebSocket<WebsocketData>
) => {
  sessions.set(sessionId, new Session(sessionId, ws));
  return sessions.size;
};

export const clearSession = (sessionId: string) => {
  const session = sessions.get(sessionId);
  if (session) {
    session.clear();
    sessions.delete(sessionId);
  }
  return sessions.size;
};

class Session implements ISession {
  #heartbeat = 0;
  #heatbeatResponseReceived = true;
  #id: string;
  #user: string = "test-user";
  #ws: ServerWebSocket;
  #token: string | undefined;
  #queue: MessageQueue;
  #viewports: string[] = [];

  // #stopUpdates: () => void;
  constructor(sessionId: string, ws: ServerWebSocket) {
    this.#id = sessionId;
    this.#ws = ws;
    this.#queue = new MessageQueue();
    // this.#stopUpdates = updateLoop(
    //   "Regular Updates",
    //   ws,
    //   config.CLIENT_UPDATE_FREQUENCY,
    //   this.queueReader
    // );
    console.log(`[VUU:net:Session] new session created sessionId ${this.#id}`);
  }

  clear() {
    this.#queue.length = 0;
  }

  get id() {
    return this.#id;
  }
  get messageQueue() {
    return this.#queue;
  }

  set incomingHeartbeat(hb: number) {
    const latency = hb - this.#heartbeat;
    this.#heatbeatResponseReceived = true;
    console.log(`[VUU:net:Session] incoming HB, latency ${latency}`);
  }

  set outgoingHeartbeat(hb: number) {
    this.#heartbeat = hb;
    this.#heatbeatResponseReceived = false;
  }

  /**
   * No HeartBeat response from client. This will be called just before the next outgoing heartbeat is sent.
   */
  get clientUnresponsive() {
    return this.#heatbeatResponseReceived === false;
  }

  get viewports() {
    return this.#viewports;
  }

  get ws() {
    return this.#ws;
  }
  // TODO what are they for ?
  addViewport(viewportId: string) {
    this.#viewports.push(viewportId);
  }

  removeViewport(viewportId: string) {
    const index = this.#viewports.indexOf(viewportId);
    if (index !== -1) {
      this.#viewports.splice(index, 1);
    }
  }

  enqueue(requestId: string, messageBody: ServerMessageBody | string) {
    if (this.#token) {
      // removed logic here that updated existing data upates with later updates.
      // It broke scrolling because TABLE_ROW entries were being inserted to an earlier batch,
      // placing them before the corresponding CHANGE_RANGE_SUCCESS ACK message
      if (typeof messageBody === "string") {
        this.#queue.push(messageBody);
      } else {
        this.#queue.push({
          module: "CORE",
          requestId,
          sessionId: this.#id,
          token: this.#token,
          user: this.#user,
          body: messageBody,
        });
      }
      logger.info(
        `[VUU:net:Session] enqueue ${requestId} ${messageBody.type}, ${
          this.#queue.length
        } messages queued`
      );
    } else {
      throw Error("no message can be sent to client before LOGIN");
    }
  }

  dequeueAllMessages = () => {
    const queue = this.#queue.dequeueAllMessages();
    // if (queue.length) {
    //   logger.info(
    //     `dequeued messages to send to client ${queue
    //       .map((m) => `#${m.requestId} ${m.body.type}`)
    //       .join(",")}`
    //   );
    // }
    if (queue.length > 0) {
      return queue;
    } else {
      return null;
    }
  };

  login(requestId: string, message: VuuLoginRequest) {
    console.log({ requestId, login: message });
    const { token } = message;
    this.#token = token;

    // this.enqueue(requestId, "Token has expired");

    this.enqueue(requestId, {
      type: "LOGIN_SUCCESS",
      vuuServerId: "server1",
    } as VuuLoginSuccessResponse);
  }

  kill() {
    console.log(`[Session] #${this.id} KILL`);
    // this.#viewports.forEach((viewportId) =>
    // ViewportContainer.closeViewport(viewportId)
    // );
    this.#ws.close();
  }
}

export const getSession = (sessionId: string) => {
  return sessions.get(sessionId);
};

export const accurateTimer = (fn: Function, time = 1000) => {
  // nextAt is the value for the next time the timer should fire.
  // timeout holds the timeoutID so the timer can be stopped.
  let nextAt: number;
  let timeout: Timer;
  // Initialzes nextAt as now + the time in milliseconds you pass
  // to accurateTimer.
  nextAt = new Date().getTime() + time;

  // This function schedules the next function call.
  const wrapper = () => {
    // The next function call is always calculated from when the
    // timer started.
    nextAt += time;
    // this is where the next setTimeout is adjusted to keep the
    //time accurate.
    timeout = setTimeout(wrapper, nextAt - new Date().getTime());
    // the function passed to accurateTimer is called.
    fn();
  };

  // this function stops the timer.
  const cancel = () => clearTimeout(timeout);

  // the first function call is scheduled.
  timeout = setTimeout(wrapper, nextAt - new Date().getTime());

  // the cancel function is returned so it can be called outside
  // accurateTimer.
  return { cancel };
};

// accurateTimer(() => {
//   console.log(
//     `[VUU:core:sessions] messages sent per second ${messageCountPerSecond}`
//   );
//   messageCountPerSecond = 0;
// }, 1000);
