/**
 * Runs the built (dist) server packages on Node.js, as a consumer without Bun
 * would: checks nodeRuntime's HTTP and websocket servers, then starts the
 * portal with no runtime configured (so it must find
 * @heswell/vuu-server-node itself), logs in over REST and the websocket, and
 * stops. Run `npm run build:packages` first.
 *
 *   npm run test:node-runtime
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Built packages, copied so they resolve each other rather than the
// workspace sources.
const COPIES: Record<string, string> = {
  "@heswell/module-admin": "dist/module-admin",
  "@heswell/service-utils": "dist/service-utils",
  "@heswell/vuu-portal": "dist/vuu-portal",
  "@heswell/vuu-server": "dist/vuu-server",
  "@heswell/vuu-server-node": "dist/vuu-server-node",
  "@heswell/vuu-table": "dist/vuu-table",
  "@heswell/vuu-viewport": "dist/vuu-viewport",
};

// Where the workspace has each copied package's source, to find the
// third-party dependencies it installed for it.
const SOURCES: Record<string, string> = {
  "@heswell/module-admin": "vuu-modules/module-admin",
  "@heswell/service-utils": "packages/service-utils",
  "@heswell/vuu-portal": "apps/vuu-portal",
  "@heswell/vuu-server": "packages/vuu-server",
  "@heswell/vuu-server-node": "packages/vuu-server-node",
  "@heswell/vuu-table": "packages/vuu-table",
  "@heswell/vuu-viewport": "packages/vuu-viewport",
};

const CONSUMER = String.raw`
import assert from "node:assert/strict";
import fs from "node:fs";
import { getServerRuntime } from "@heswell/vuu-server";
import { nodeRuntime } from "@heswell/vuu-server-node";
import { main } from "@heswell/vuu-portal/main";

assert.equal(typeof Bun, "undefined", "must run on Node, not Bun");

const waitFor = async (predicate, what) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 3000) throw Error("timed out waiting for " + what);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
const openClient = (url) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(Error("could not connect to " + url));
  });

// HTTP
{
  const server = await nodeRuntime.serveHttp({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/fail") throw Error("expected failure");
      if (url.pathname !== "/echo") return undefined;
      const headers = new Headers();
      headers.append("set-cookie", "a=1");
      headers.append("set-cookie", "b=2");
      return Response.json({ method: req.method, body: await req.json() }, { status: 201, headers });
    },
  });
  const base = "http://localhost:" + server.port;
  const echo = await fetch(base + "/echo", { method: "POST", body: JSON.stringify({ a: 1 }) });
  assert.equal(echo.status, 201);
  assert.deepEqual(echo.headers.getSetCookie(), ["a=1", "b=2"]);
  assert.deepEqual(await echo.json(), { method: "POST", body: { a: 1 } });
  assert.equal((await fetch(base + "/missing")).status, 404);
  assert.equal((await fetch(base + "/fail")).status, 500);
  await server.stop();
  await assert.rejects(fetch(base + "/echo"));
  console.log("ok  http");
}

// Websocket
{
  const closes = [];
  const channels = [];
  let id = 0;
  const server = await nodeRuntime.serveWebSocket({
    port: 0,
    path: "/ws",
    maxPayloadLength: 1024 * 1024,
    idleTimeoutSeconds: 10,
    createData: () => ({ sessionId: "s" + ++id }),
    open: (channel) => channels.push(channel),
    message: (channel, message) => channel.send("echo:" + message + ":" + channel.data.sessionId),
    close: (channel, code) => closes.push([channel.data.sessionId, code]),
  });
  const url = "ws://localhost:" + server.port + "/ws";

  await assert.rejects(openClient("ws://localhost:" + server.port + "/other"));

  const a = await openClient(url);
  const reply = new Promise((resolve) => (a.onmessage = (event) => resolve(String(event.data))));
  a.send("hi");
  assert.equal(await reply, "echo:hi:s1");

  const closedByServer = new Promise((resolve) => (a.onclose = (event) => resolve(event.code)));
  channels[0].close(4001, "evicted");
  assert.equal(await closedByServer, 4001);
  await waitFor(() => closes.length === 1, "server close callback");
  assert.deepEqual(closes[0], ["s1", 4001]);

  const b = await openClient(url);
  b.close(1000);
  await waitFor(() => closes.length === 2, "client close callback");
  assert.deepEqual(closes[1], ["s2", 1000]);

  const c = await openClient(url);
  const closedByStop = new Promise((resolve) => (c.onclose = () => resolve()));
  await server.stop();
  await closedByStop;
  console.log("ok  websocket");
}

// Portal, with no runtime configured
{
  process.env.VUU_WEBSOCKET_PORT = "0";
  process.env.VUU_HTTPS_PORT = "0";
  process.env.VUU_LOG_LEVEL = "warn";
  const application = await main();
  assert.equal(getServerRuntime().name, "node", "portal should pick the node runtime");
  const { restUrl, webSocketPort } = application.server;

  const authn = await fetch(restUrl + "/api/authn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "demo", password: "demo" }),
  });
  assert.equal(authn.status, 200);
  const { token } = await authn.json();
  assert.ok(token, "REST login returns a token");

  const socket = await openClient("ws://localhost:" + webSocketPort + "/websocket-portal");
  const login = new Promise((resolve) => (socket.onmessage = (event) => resolve(JSON.parse(String(event.data)))));
  socket.send(JSON.stringify({ body: { type: "LOGIN", token }, module: "CORE", requestId: "login", sessionId: "" }));
  const { body } = await login;
  assert.equal(body.type, "LOGIN_SUCCESS");
  assert.ok(body.moduleRegistry, "LOGIN_SUCCESS carries the module registry");
  socket.close();

  assert.ok(fs.existsSync("modules.yaml"), "module catalogue written as YAML");
  await application.lifecycle.destroy();
  console.log("ok  portal on node");
}
console.log("node runtime smoke test passed (node " + process.version + ")");
process.exit(0);
`;

const consumerDir = fs.mkdtempSync(path.join(os.tmpdir(), "vuu-node-smoke-"));
try {
  const nodeModules = path.join(consumerDir, "node_modules");
  const linked = new Set<string>();
  const place = (name: string, source: string, copy: boolean) => {
    const target = path.join(nodeModules, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (copy) fs.cpSync(source, target, { recursive: true });
    else fs.symlinkSync(source, target, "dir");
  };

  for (const [name, dist] of Object.entries(COPIES)) {
    const source = path.join(ROOT, dist);
    if (!fs.existsSync(path.join(source, "package.json"))) {
      throw Error(`${source} not found, run npm run build:packages first`);
    }
    place(name, source, true);
  }

  // Third-party dependencies: link the copy the workspace installed.
  for (const [name, dist] of Object.entries(COPIES)) {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, dist, "package.json"), "utf8"),
    ) as { dependencies?: object; peerDependencies?: object };
    const deps = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies });
    for (const dep of deps) {
      if (COPIES[dep] || linked.has(dep) || dep.startsWith("@types/")) continue;
      const candidates = [
        path.join(ROOT, SOURCES[name], "node_modules", dep),
        path.join(ROOT, "node_modules", dep),
      ];
      const found = candidates.find((candidate) => fs.existsSync(candidate));
      if (!found) throw Error(`cannot find ${dep} (needed by ${name})`);
      place(dep, fs.realpathSync(found), false);
      linked.add(dep);
    }
  }

  fs.writeFileSync(path.join(consumerDir, "package.json"), '{ "type": "module" }');
  fs.writeFileSync(path.join(consumerDir, "smoke.mjs"), CONSUMER);
  execFileSync("node", ["smoke.mjs"], { cwd: consumerDir, stdio: "inherit" });
} finally {
  fs.rmSync(consumerDir, { recursive: true, force: true });
}
