import type { ServerMessageBody } from "@vuu-ui/vuu-protocol-types";
import { ServerWebSocket } from "bun";
import { MessageQueue } from "./MessageQueue";
import { OrdersServiceMessage } from "./order-service-types";
import OrderStore from "./OrderStore";
import type { WebsocketData } from "./server";
import { WebSocketSink } from "./WebSocketSink";
import { ArrayDataStreamSource } from "./ArrayDataStreamSource";

export interface ISession<T extends object> {
  addViewport: (viewportId: string) => void;
  enqueue: (requestId: string, messageBody: ServerMessageBody) => void;
  kill: () => void;
  readQueue: () => null | T[];
  sendHeartBeat: () => void;
  readonly id: string;
  readonly clientUnresponsive?: boolean;
  readonly outgoingHeartbeat?: number;
  readonly viewports: string[];
  readonly stream: WritableStream;
  readonly ws: WebSocket;
}

const sessions = new Map<string, ISession<OrdersServiceMessage>>();

export const startHeartbeats = (updateFrequency = 60_000) => {
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
    const expiredSessions: ISession<OrdersServiceMessage>[] = [];
    for (const session of sessions.values()) {
      if (session.clientUnresponsive) {
        console.log(
          `[heartbeatLoop] session #${session.id} received no heartbeat response from client`
        );
        expiredSessions.push(session);
      } else {
        session.sendHeartBeat();
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
    if (OrderStore.hasUpdates) {
      const messages = OrderStore.queuedMessages;

      for (const session of sessions.values()) {
        // const readStream = new ReadableStream(
        //   new ArrayDataStreamSource(session.id, messages, {
        //     type: "insert",
        //     tableName: "parentOrders",
        //   })
        // );
        // readStream.pipeTo(session.stream);
        // for (const message of messages) {
        session.ws.send(JSON.stringify(messages));
        // }
      }

      const end = performance.now();
      console.log(
        `[ORDERS:service:sessions] ${messages.length} queued messages took ${
          end - start
        }ms`
      );
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
  sessions.set(sessionId, new Session<OrdersServiceMessage>(sessionId, ws));
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

class Session<T extends object> implements ISession<T> {
  #heartbeat = 0;
  #heatbeatResponseReceived = true;
  #id: string;
  #user: string | undefined;
  #ws: ServerWebSocket;
  #stream: WritableStream;
  #token: string | undefined;
  #queue: MessageQueue<T>;
  #viewports: string[] = [];

  // #stopUpdates: () => void;
  constructor(sessionId: string, ws: ServerWebSocket) {
    this.#id = sessionId;
    this.#ws = ws;
    this.#queue = new MessageQueue();
    this.#stream = new WritableStream(new WebSocketSink(sessionId, ws));

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

  get stream() {
    // TODO create lazily
    return this.#stream;
  }

  set incomingHeartbeat(hb: number) {
    const latency = hb - this.#heartbeat;
    this.#heatbeatResponseReceived = true;
    console.log(`[ORDERS:service:Session] incoming HB, latency ${latency}`);
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

  sendHeartBeat() {
    const ts = Date.now();
    this.outgoingHeartbeat = ts;
    this.#ws.send(`{"type":"HB", "ts": ${ts} }`);
  }

  kill() {
    console.log(`[Session] #${this.id} KILL`);
    this.#ws.close();
  }
}

export function getSession<T extends object>(
  sessionId: string,
  throwIfUndefined: true
): ISession<T>;
export function getSession<T extends object>(
  sessionId: string,
  throwIfUndefined?: false
): ISession<T> | undefined;
export function getSession(sessionId: string, throwIfUndefined?: boolean) {
  const session = sessions.get(sessionId);
  if (session) {
    return session;
  } else if (throwIfUndefined) {
    throw Error(`[ORDERS:service:sessions] session not found #${sessionId}`);
  }
}
