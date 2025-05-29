import type { ISession } from "./server-types";
import type {
  ClientToServerLogin,
  ServerMessageBody,
} from "@vuu-ui/vuu-protocol-types";
import { MessageQueue } from "./messageQueue";
import type { WebsocketData } from "./server";
import { ServerWebSocket } from "bun";
import ViewportContainer from "./ViewportContainer.ts";

const sessions = new Map<string, ISession>();

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
    console.log(`stopping heartbeat updateLoop`);
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
      const queuedMessages = session.readQueue();
      // console.log(
      //   `${queuedMessages?.length ?? 0} messages for session ${session.id}`
      // );
      if (Array.isArray(queuedMessages)) {
        for (const message of queuedMessages) {
          session.ws.send(JSON.stringify(message));
        }
      } else if (typeof queuedMessages === "string") {
        session.ws.send(queuedMessages);
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
  #user: string | undefined;
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
    console.log(`new session created sessionId ${this.#id}`);
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
    console.log(`incoming HB, latency ${latency}`);
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

  addViewport(viewportId: string) {
    this.#viewports.push(viewportId);
  }

  removeViewport(viewportId: string) {
    const index = this.#viewports.indexOf(viewportId);
    if (index !== -1) {
      this.#viewports.splice(index, 1);
    }
  }

  enqueue(requestId: string, messageBody: ServerMessageBody) {
    if (this.#token && this.#user) {
      this.#queue.push({
        module: "CORE",
        requestId,
        sessionId: this.#id,
        token: this.#token,
        user: this.#user,
        body: messageBody,
      });
    } else {
      throw Error("no message can be sent to client before LOGIN");
    }
  }

  readQueue = () => {
    const queue = this.#queue.extractAll();
    if (queue.length > 0) {
      return queue;
    } else {
      return null;
    }
  };

  login(requestId: string, message: ClientToServerLogin) {
    console.log({ requestId, login: message });
    const { token, user } = message;
    this.#user = user;
    this.#token = token;
    this.enqueue(requestId, {
      type: "LOGIN_SUCCESS",
      token,
    });
  }

  kill() {
    console.log(`[Session] #${this.id} KILL`);
    this.#viewports.forEach((viewportId) =>
      ViewportContainer.closeViewport(viewportId)
    );
    this.#ws.close();
  }
}

export const getSession = (sessionId: string) => {
  return sessions.get(sessionId);
};
