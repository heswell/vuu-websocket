import { WebsocketData } from "@heswell/service-utils";
import type { ServerWebSocket } from "bun";

export type Channel = ServerWebSocket<WebsocketData>;
