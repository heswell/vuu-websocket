import type { HttpRequestHandler } from "../../core/VuuServerOptions";
import { createCorsHeaders } from "../../net/http/CorsOrigins";
import type { ViewportExports } from "./ViewportExports";

export type ViewportExportHttpHandlerOptions = {
  allowedOrigins: readonly string[];
  path?: string;
};

/**
 * GET {path}/{exportId} streams a snapshot taken by the EXPORT_VIEWPORT
 * viewport RPC. The id is a one-time, short lived capability (a random
 * uuid, bound to the snapshot of the session that asked for it): the
 * first fetch claims it, later fetches get 404.
 */
export function createViewportExportHttpHandler(
  getExports: () => ViewportExports,
  { allowedOrigins, path = "/api/export" }: ViewportExportHttpHandlerOptions,
): HttpRequestHandler {
  const prefix = `${path}/`;
  return async (req, url) => {
    const { pathname } = url;
    if (!pathname.startsWith(prefix)) {
      return undefined;
    }
    const cors = createCorsHeaders(req, allowedOrigins);
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          "Access-Control-Allow-Methods": "GET",
          "Access-Control-Max-Age": "600",
        },
      });
    }
    if (req.method !== "GET") {
      return new Response(null, {
        status: 405,
        headers: { ...cors, Allow: "GET" },
      });
    }
    const id = decodeURIComponent(pathname.slice(prefix.length));
    const stream = getExports().stream(id);
    if (stream === undefined) {
      return Response.json(
        { error: "export not found, expired or already claimed" },
        { status: 404, headers: cors },
      );
    }
    return new Response(stream, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  };
}
