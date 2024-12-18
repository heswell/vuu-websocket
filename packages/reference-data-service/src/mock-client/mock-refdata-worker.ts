const socket = new WebSocket("ws://localhost:8091");

let start = 0;
// message is received
socket.addEventListener("message", (evt) => {
  const message = JSON.parse(evt.data as string);
  if (message.count) {
    const end = performance.now();
    console.log(
      `took ${end - start}ms to receive ${message.count} instruments`
    );
  }
});

// socket opened
socket.addEventListener("open", (event) => {
  console.log(`[RedDataClient] websocket open`);
  start = performance.now();
  socket.send(JSON.stringify({ type: "instruments" }));
});

// socket closed
socket.addEventListener("close", (event) => {
  console.log(`[RedDataClient] websocket close`);
});

// error handler
socket.addEventListener("error", (event) => {
  console.log(`[RedDataClient] websocket error`);
});
