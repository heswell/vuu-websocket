import { WebsocketData } from "@heswell/service-utils";
import { ServerWebSocket } from "bun";

export type Channel = ServerWebSocket<WebsocketData>;
