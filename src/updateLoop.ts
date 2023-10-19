import { ServerWebSocket } from "bun";
import { WebSocket } from "ws";

export function updateLoop(
  name: string,
  ws: ServerWebSocket<{ authToken: string }>,
  interval: number,
  readQueue: () => any
) {
  console.log(`starting update loop ${name} @  ${interval}`);

  let _keepGoing = true;
  let _timer: Timer | null = null;

  const tick: TimerHandler = () => {
    const queuedMessages = readQueue();

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
