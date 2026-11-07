import YAML from "yaml";
import type { ServerRuntime } from "@heswell/vuu-server";
import { serveHttp } from "./serveHttp";
import { serveWebSocket } from "./serveWebSocket";

/** The Node.js runtime: node:http(s) for HTTP, ws for websockets, yaml. */
export const nodeRuntime: ServerRuntime = {
  name: "node",
  serveHttp,
  serveWebSocket,
  yaml: {
    parse: (text) => YAML.parse(text),
    stringify: (value) => YAML.stringify(value, { indent: 2 }),
  },
};
