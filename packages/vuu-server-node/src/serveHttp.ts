import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  getLogger,
  type RunningServer,
  type ServeHttpOptions,
} from "@heswell/vuu-server";
import { close, createNodeServer, listen } from "./listen";

/** A web Request for a Node request, so handlers written for Bun work as is. */
export function toRequest(
  req: IncomingMessage,
  res: ServerResponse,
  scheme: "http" | "https",
): Request {
  const url = new URL(req.url ?? "/", `${scheme}://${req.headers.host ?? "localhost"}`);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  const abort = new AbortController();
  res.once("close", () => {
    if (!res.writableFinished) abort.abort();
  });
  return new Request(url, {
    method,
    headers,
    signal: abort.signal,
    body: hasBody ? (Readable.toWeb(req) as unknown as BodyInit) : undefined,
    // Required by Node's fetch for a streamed request body.
    duplex: "half",
  } as RequestInit);
}

/** Writes a web Response to a Node response. */
export async function writeResponse(res: ServerResponse, response: Response) {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") headers[name] = value;
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) headers["set-cookie"] = cookies;
  res.writeHead(response.status, response.statusText, headers);
  if (response.body) {
    await pipeline(Readable.fromWeb(response.body as never), res);
  } else {
    res.end();
  }
}

const log = getLogger("vuu.net");

const notFound = () => new Response("Not found", { status: 404 });

export async function serveHttp({
  fetch,
  port,
  tls,
}: ServeHttpOptions): Promise<RunningServer> {
  const server = createNodeServer(tls);
  const scheme = tls ? "https" : "http";
  server.on("request", async (req, res) => {
    try {
      const response = (await fetch(toRequest(req, res, scheme))) ?? notFound();
      await writeResponse(res, response);
    } catch (error) {
      log.error(`HTTP ${req.method} ${req.url} failed`, error);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("Internal server error");
      } else {
        res.destroy(error as Error);
      }
    }
  });
  const boundPort = await listen(server, port);
  return {
    hostname: "localhost",
    port: boundPort,
    stop: () => close(server),
  };
}
