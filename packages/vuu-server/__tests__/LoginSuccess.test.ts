import { describe, expect, test } from "bun:test";
import {
  LifecycleContainer,
  LoginTokenService,
  VuuServer,
  VuuServerConfig,
  VuuUserWithAuthorizations,
  VuuWebSocketOptions,
} from "../src";
import { LoginSuccess } from "../src/net/Messages";

describe("LoginSuccess", () => {
  test("preserves the generic response when no registry is provided", () => {
    expect(LoginSuccess("server-1")).toEqual({
      type: "LOGIN_SUCCESS",
      vuuServerId: "server-1",
    });
  });

  test("adds an optional module registry", () => {
    const moduleRegistry = {
      modules: [
        {
          id: 1,
          name: "moduleAdmin",
          title: "Manage remote modules",
          description: "Create new remote module, update existing modules",
          version: 1,
          enabled: true,
          location: "/Modules/Manage Modules",
          path: "/modules/admin",
          mfComponent: "ModuleAdmin",
          mfScope: "ModuleAdmin",
          mfUrl: "http://localhost:5008",
          vuu: { connectionId: "portal" },
        },
      ],
    };

    expect(LoginSuccess("portal-server", { moduleRegistry })).toEqual({
      type: "LOGIN_SUCCESS",
      vuuServerId: "portal-server",
      moduleRegistry,
    });
  });

  test("uses the authenticated user to populate the websocket login response", async () => {
    const lifecycle = new LifecycleContainer();
    const loginTokenService = LoginTokenService();
    const token = loginTokenService.getToken(
      VuuUserWithAuthorizations("admin", ["module-admin-view"]),
    );
    const config = VuuServerConfig(
      VuuWebSocketOptions().withWsPort(0),
      {},
      loginTokenService,
      [],
      (user) => ({
        moduleRegistry: {
          modules: [
            {
              id: 1,
              name: "moduleAdmin",
              title: user.name,
              description: user.authorizations.join(","),
              version: 1,
              enabled: true,
              location: "/Modules/Manage Modules",
              path: "/modules/admin",
              mfComponent: "ModuleAdmin",
              mfScope: "ModuleAdmin",
              mfUrl: "http://localhost:5008",
              vuu: { connectionId: "portal" },
            },
          ],
        },
      }),
    );
    const server = new VuuServer(config, lifecycle);

    try {
      await lifecycle.start();
      const response = await login(server.webSocketPort as number, token);

      expect(response.body).toEqual({
        type: "LOGIN_SUCCESS",
        vuuServerId: expect.any(String),
        moduleRegistry: {
          modules: [
            expect.objectContaining({
              name: "moduleAdmin",
              title: "admin",
              description: "module-admin-view",
            }),
          ],
        },
      });
    } finally {
      await lifecycle.destroy();
    }
  });
});

function login(port: number, token: string): Promise<{ body: unknown }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${port}/websocket`);
    socket.addEventListener("error", () => reject(new Error("WebSocket failed")));
    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          body: { type: "LOGIN", token },
          module: "CORE",
          requestId: "login-request",
          sessionId: "",
        }),
      );
    });
    socket.addEventListener("message", ({ data }) => {
      socket.close();
      resolve(JSON.parse(String(data)) as { body: unknown });
    });
  });
}
