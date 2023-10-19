import { uuid } from "./uuid";
import { MessageQueue } from "./messageQueue";

const sessions = new Map<ServerWebSocket<{ authToken: string }>, Session>();

import { ServerWebSocket } from "bun";
import { VuuServerConfig } from "./serverTypes";

export const startMainUpdateLoop = (updateFrequency = 250) => {
  return updateLoop("Regular Updates", updateFrequency);
};

export function updateLoop(name: string, interval: number) {
  console.log(`starting update loop ${name} @  ${interval}`);

  let _keepGoing = true;
  let _timer: Timer | null = null;

  const tick: TimerHandler = () => {
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

export const createSession = (
  ws: ServerWebSocket<{ authToken: string }>,
  config: VuuServerConfig
) => {
  sessions.set(ws, new Session(ws, config));
  return sessions.size;
};

export const clearSession = (ws: ServerWebSocket<{ authToken: string }>) => {
  const session = sessions.get(ws);
  if (session) {
    session.clear();
    sessions.delete(ws);
  }
};

class Session {
  #id: string;
  #queue: MessageQueue;
  // #stopUpdates: () => void;
  constructor(ws: ServerWebSocket<{ authToken: string }>, config: any) {
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

  readQueue = () => {
    const queue = this.#queue.extractAll();
    if (queue.length > 0) {
      return queue;
    } else {
      return null;
    }
  };

  login(requestId: string, message: any) {
    const { token, user } = message;
    this.#queue.push({
      requestId,
      sessionId: this.#id,
      token,
      user,
      body: {
        type: "LOGIN_SUCCESS",
        token,
      },
    });
  }
}

export const getSession = (ws: ServerWebSocket<{ authToken: string }>) => {
  return sessions.get(ws);
};
