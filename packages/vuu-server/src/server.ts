import { VuuServer } from "./core/VuuServer";
import { ServerMessagingConfig } from "./server-types";
import { websocketConnectionHandler } from "./websocket-connection-handler-DEPRECATED";
import { uuid } from "@vuu-ui/vuu-utils";
import path from "path";
import { type Authenticator } from "./net/auth/Authenticator";
import { AuthenticatorWithUserList } from "./net/auth/AuthenticatorWithUserList";
import loginTokenService from "./net/LoginTokenService";
import { ConfigFactory } from "./util/ConfigFactory";

const PRIORITY_UPDATE_FREQUENCY = 20;
const CLIENT_UPDATE_FREQUENCY = 120;
const HEARTBEAT_FREQUENCY = 6000;

const msgConfig: ServerMessagingConfig = {
  CLIENT_UPDATE_FREQUENCY,
  HEARTBEAT_FREQUENCY,
  PRIORITY_UPDATE_FREQUENCY,
};

const CONFIG_KEYS = {
  port: "vuu.port",
} as const;

export interface WebsocketData {
  sessionId: string;
}

const authenticator: Authenticator = new AuthenticatorWithUserList(
  loginTokenService,
  [],
);

export default async function start(vuuServer: VuuServer) {
  const certsPath = path.join(import.meta.dir, "../certs");
  const config = ConfigFactory.load();
  const websocketPort = config.getNumber(CONFIG_KEYS.port, 8091);

  const websocketServer = Bun.serve({
    certFile: `${certsPath}/cert.pem`,
    keyFile: `${certsPath}/key.pem`,
    port: websocketPort,

    async fetch(req, server) {
      const sessionId = uuid();
      console.log(
        `[VUU:server] websocket upgrade request sessionId ${sessionId}`,
      );
      const success = server.upgrade(req, { data: { sessionId } });
      if (success) {
        // Bun automatically returns a 101 Switching Protocols
        // if the upgrade succeeds
        return undefined;
      }

      // handle HTTP request normally
      const url = new URL(req.url);

      if (url.pathname === "/api/authn") {
        // this is the 'basic' auth flow where we authenticate against
        // Vuu. We post user/password and vuu returns a vuu user token
        if (req.method === "POST") {
          const { username, password } = (await req.json()) as {
            username: string;
            password: string;
          };
          const token = await authenticator.authenticate([username, password]);

          const responseInit: ResponseInit = {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
              "vuu-auth-token": token,
            },
          };
          return new Response(null, responseInit);
        }
      } else if (url.pathname === "/api/login") {
        // this is the 'keycloak' auth flow where we first authenticate against
        // keycloak to get an access token. We exchange the access token for a vuu
        // user token.
        if (req.method === "GET") {
          const vuuUser = {
            name: "steve",
            authorizations: [],
          };
          const token = `${btoa(JSON.stringify(vuuUser))}.${uuid()}`;

          const responseInit: ResponseInit = {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
              "Content-Type": "application/json",
            },
          };
          return new Response(JSON.stringify({ token }), responseInit);
        }
      }
      return new Response("Hello world!");
    },
    websocket: websocketConnectionHandler(msgConfig, vuuServer),
  });

  console.log(
    `[VUU] Websocket listening on ${websocketServer.hostname}:${websocketServer.port}`,
  );
}
