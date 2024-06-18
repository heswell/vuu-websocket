import type { ISession } from "@heswell/server-types";
import type {
  ClientToServerLogin,
  ServerToClientBody,
} from "@vuu-ui/vuu-protocol-types";
import { uuid } from "@vuu-ui/vuu-utils";
import { ServerWebSocket } from "bun";
import { MessageQueue } from "./messageQueue";

const sessions = new Map<ServerWebSocket<{ authToken: string }>, Session>();

export const startHeartbeats = (updateFrequency = 250) => {
  return heartbeatLoop(updateFrequency);
};

export const startMainUpdateLoop = (updateFrequency = 250) => {
  return updateLoop("Regular Updates", updateFrequency);
};

export function heartbeatLoop(interval: number) {
  console.log(`starting heartbeat loop @  ${interval}`);

  let _keepGoing = true;
  let _timer: Timer | null = null;

  const tick = () => {
    const ts = Date.now();
    for (const [ws, session] of sessions) {
      session.outgoingHeartbeat = ts;
      ws.send(
        `{"requestId":"NA","sessionId":"${session.id}","user":"","token":"","body":{"type":"HB", "ts": ${ts} }}`
      );
    }
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
  console.log(`starting update loop ${name} @  ${interval}`);

  let _keepGoing = true;
  let _timer: Timer | null = null;

  const tick = () => {
    for (const [ws, session] of sessions) {
      const queuedMessages = session.readQueue();
      if (Array.isArray(queuedMessages)) {
        for (const message of queuedMessages) {
          ws.send(JSON.stringify(message));
        }
      } else if (typeof queuedMessages === "string") {
        ws.send(queuedMessages);
      }
      if (_keepGoing) {
        _timer = setTimeout(tick, interval);
      }
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

export const createSession = (ws: ServerWebSocket<{ authToken: string }>) => {
  sessions.set(ws, new Session(ws));
  return sessions.size;
};

export const clearSession = (ws: ServerWebSocket<{ authToken: string }>) => {
  const session = sessions.get(ws);
  if (session) {
    session.clear();
    sessions.delete(ws);
  }
  return sessions.size;
};

class Session implements ISession {
  #heartbeat = 0;
  #id: string;
  #user: string | undefined;
  #token: string | undefined;
  #queue: MessageQueue;
  // #stopUpdates: () => void;
  constructor(ws: ServerWebSocket<{ authToken: string }>) {
    this.#id = uuid();
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
    // this.#stopUpdates();
  }

  get id() {
    return this.#id;
  }
  get messageQueue() {
    return this.#queue;
  }

  set incomingHeartbeat(hb: number) {
    const latency = hb - this.#heartbeat;
    console.log(`latency ${latency}`);
  }

  set outgoingHeartbeat(hb: number) {
    this.#heartbeat = hb;
  }

  enqueue(requestId: string, messageBody: ServerToClientBody) {
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
}

export const getSession = (ws: ServerWebSocket<{ authToken: string }>) => {
  return sessions.get(ws);
};
