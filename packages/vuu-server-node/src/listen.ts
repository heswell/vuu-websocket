import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import type { TlsFiles } from "@heswell/vuu-server";

export type NodeServer = http.Server | https.Server;

export const createNodeServer = (tls?: TlsFiles): NodeServer =>
  tls
    ? https.createServer({
        cert: fs.readFileSync(tls.certPath),
        key: fs.readFileSync(tls.keyPath),
      })
    : http.createServer();

/** Listens on all interfaces, as Bun.serve does; resolves the bound port. */
export const listen = (server: NodeServer, port: number) =>
  new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve((server.address() as AddressInfo).port);
    });
  });

const CLOSE_TIMEOUT_MS = 250;

/**
 * Stops listening and drops open connections. Doesn't wait more than
 * CLOSE_TIMEOUT_MS for the close callback: under Bun's node:http (1.3.x) it
 * never fires once an upgraded socket was closing, although the listener is
 * closed.
 */
export const close = async (server: NodeServer) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    }),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, CLOSE_TIMEOUT_MS);
    }),
  ]);
  clearTimeout(timer);
};
