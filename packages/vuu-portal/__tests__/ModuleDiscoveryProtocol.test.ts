import { afterEach, describe, expect, test } from "bun:test";
import type {
  ServerToClientTableRows,
  VuuRpcServiceResponse,
  VuuServerMessage,
  VuuViewportCreateSuccessResponse,
} from "@vuu-ui/vuu-protocol-types";

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
}

const {
  LifecycleContainer,
  LoginTokenService,
  VuuServer,
  VuuServerConfig,
  VuuUserWithAuthorizations,
  VuuWebSocketOptions,
} = await import("@heswell/vuu-server");
const {
  DEFAULT_MODULE_DEFINITIONS,
  moduleDefinitionsToRows,
  toManagedModules,
} = await import("@heswell/module-admin");
const { InMemoryModuleStore, ModuleDiscoveryModule, ModuleState } = await import(
  "../src/modules/ModuleDiscovery/ModuleDiscoveryModule"
);

const moduleColumns = [
  "id",
  "parentModuleId",
  "name",
  "title",
  "description",
  "version",
  "enabled",
  "location",
  "path",
  "mfComponent",
  "mfScope",
  "mfUrl",
  "vuuConnectionId",
  "vuuWebsocketUrl",
  "vuuRestUrl",
  "navIconUrl",
];

describe("module discovery protocol", () => {
  let lifecycle: InstanceType<typeof LifecycleContainer> | undefined;
  let socket: WebSocket | undefined;

  afterEach(async () => {
    socket?.close();
    socket = undefined;
    await lifecycle?.destroy();
    lifecycle = undefined;
  });

  test("projects table rows to the CREATE_VP column contract", async () => {
    lifecycle = new LifecycleContainer();
    const loginTokenService = LoginTokenService();
    const token = loginTokenService.getToken(
      VuuUserWithAuthorizations("module-admin", ["module-admin-access"]),
    );
    const server = new VuuServer(
      VuuServerConfig(
        VuuWebSocketOptions().withWsPort(0),
        {},
        loginTokenService,
      ).withModule(ModuleDiscoveryModule(new ModuleState(new InMemoryModuleStore(toManagedModules(DEFAULT_MODULE_DEFINITIONS, [], Date.now())), toManagedModules(DEFAULT_MODULE_DEFINITIONS, [], Date.now())))),
      lifecycle,
    );
    await lifecycle.start();

    const connection = await login(server.webSocketPort as number, token);
    socket = connection.socket;
    const createResponse = waitForMessage<VuuViewportCreateSuccessResponse>(
      socket,
      (body): body is VuuViewportCreateSuccessResponse =>
        body.type === "CREATE_VP_SUCCESS",
    );
    const tableRows = waitForMessage<ServerToClientTableRows>(
      socket,
      (body): body is ServerToClientTableRows => body.type === "TABLE_ROW",
    );
    socket.send(
      JSON.stringify({
        body: {
          aggregations: [],
          columns: moduleColumns,
          filterSpec: { filter: "" },
          groupBy: [],
          range: { from: 0, to: 10 },
          sort: { sortDefs: [] },
          table: { module: "MODULE_DISCOVERY", table: "modules" },
          type: "CREATE_VP",
        },
        module: "MODULE_DISCOVERY",
        requestId: "create-modules",
        sessionId: connection.sessionId,
      }),
    );

    const [createVpSuccess, tableRowMessage] = await Promise.all([
      createResponse,
      tableRows,
    ]);
    const row = tableRowMessage.rows.find(
      ({ updateType }) => updateType === "U",
    );

    expect(createVpSuccess.columns).toEqual(moduleColumns);
    expect(row?.data).toEqual(moduleDefinitionsToRows(DEFAULT_MODULE_DEFINITIONS)[0]);
    expect(row?.data).toHaveLength(createVpSuccess.columns.length);

    const rpcResponse = waitForMessage<VuuRpcServiceResponse>(
      socket,
      (body): body is VuuRpcServiceResponse =>
        body.type === "RPC_RESPONSE" &&
        (body.rpcName as string) === "createModule",
    );
    socket.send(
      JSON.stringify({
        body: {
          context: { type: "VIEWPORT_CONTEXT", viewPortId: createVpSuccess.viewPortId },
          params: {
            module: JSON.stringify({
              name: "protocol-module",
              title: "Protocol module",
              enabled: true,
              location: "/Tools/Protocol",
              path: "/protocol",
              mfComponent: "ProtocolModule",
              mfScope: "protocolModule",
              mfUrl: "https://example.com/protocol.js",
              accessRole: "protocol-access",
            }),
          },
          rpcName: "createModule",
          type: "RPC_REQUEST",
        },
        module: "MODULE_DISCOVERY",
        requestId: "create-module-rpc",
        sessionId: connection.sessionId,
      }),
    );

    expect((await rpcResponse).result).toEqual({
      type: "SUCCESS_RESULT",
      data: { id: 6, version: 1 },
    });
  });
});

async function login(
  port: number,
  token: string,
): Promise<{ socket: WebSocket; sessionId: string }> {
  const socket = new WebSocket(`ws://localhost:${port}/websocket`);
  const sessionId = await new Promise<string>((resolve, reject) => {
    socket.addEventListener("error", () =>
      reject(new Error("WebSocket failed")),
    );
    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          body: { token, type: "LOGIN" },
          module: "CORE",
          requestId: "login",
          sessionId: "",
        }),
      );
    });
    socket.addEventListener(
      "message",
      ({ data }) => {
        const message = JSON.parse(String(data)) as VuuServerMessage;
        if (message.body.type === "LOGIN_SUCCESS" && message.sessionId) {
          resolve(message.sessionId);
        }
      },
      { once: true },
    );
  });
  return { socket, sessionId };
}

function waitForMessage<T>(
  socket: WebSocket,
  matches: (body: VuuServerMessage["body"]) => body is T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const listener = ({ data }: MessageEvent) => {
      const message = JSON.parse(String(data)) as VuuServerMessage;
      if (matches(message.body)) {
        socket.removeEventListener("message", listener);
        resolve(message.body);
      }
    };
    socket.addEventListener("error", () =>
      reject(new Error("WebSocket failed")),
    );
    socket.addEventListener("message", listener);
  });
}
