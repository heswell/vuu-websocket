import { HttpRequestHandler } from "../../../core/VuuServerOptions";

export type AdminHttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export type AdminRequestContext = {
  /** values of ':name' segments matched in the route path */
  params: Record<string, string>;
  req: Request;
  url: URL;
};

/**
 * A single admin action. Path is relative to the admin base path and may
 * include ':name' segments, e.g. "/notifications/:id".
 */
export type AdminRoute = {
  handle: (context: AdminRequestContext) => Promise<Response> | Response;
  method: AdminHttpMethod;
  path: string;
};

export type AdminHttpHandlerOptions = {
  path?: string;
};

/**
 * Throw from a route handler to return a JSON error response.
 */
export class AdminRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const adminJsonError = (status: number, error: string) =>
  Response.json({ error }, { status });

/**
 * Reads the request body as a JSON object. An empty body yields {}.
 */
export async function readJsonObject(
  req: Request,
): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    const text = await req.text();
    body = text.trim() === "" ? {} : JSON.parse(text);
  } catch {
    throw new AdminRequestError(400, "Request body must be valid JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AdminRequestError(400, "Request body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

type CompiledRoute = AdminRoute & { segments: string[] };

const toSegments = (path: string) => path.split("/").filter(Boolean);

function matchRoute(segments: string[], requestSegments: string[]) {
  if (segments.length !== requestSegments.length) {
    return undefined;
  }
  const params: Record<string, string> = {};
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const requestSegment = decodeURIComponent(requestSegments[i]);
    if (segment.startsWith(":")) {
      params[segment.slice(1)] = requestSegment;
    } else if (segment !== requestSegment) {
      return undefined;
    }
  }
  return params;
}

/**
 * UNAUTHENTICATED admin api, intended for development testing only, e.g.
 * to trigger notifications, price changes, order creation from curl.
 * Requests under path that match no route return 404.
 */
export function createAdminHttpHandler(
  routes: AdminRoute[],
  { path = "/api/admin" }: AdminHttpHandlerOptions = {},
): HttpRequestHandler {
  const compiledRoutes: CompiledRoute[] = routes.map((route) => ({
    ...route,
    segments: toSegments(route.path),
  }));

  return async (req, url) => {
    const { pathname } = url;
    if (pathname !== path && !pathname.startsWith(`${path}/`)) {
      return undefined;
    }
    const requestSegments = toSegments(pathname.slice(path.length));

    if (req.method === "GET" && requestSegments.length === 0) {
      return Response.json(
        routes.map(({ method, path }) => ({ method, path })),
      );
    }

    const allowedMethods: AdminHttpMethod[] = [];
    for (const route of compiledRoutes) {
      const params = matchRoute(route.segments, requestSegments);
      if (params === undefined) {
        continue;
      }
      if (route.method !== req.method) {
        allowedMethods.push(route.method);
        continue;
      }
      try {
        return await route.handle({ params, req, url });
      } catch (error) {
        if (error instanceof AdminRequestError) {
          return adminJsonError(error.status, error.message);
        }
        throw error;
      }
    }

    if (allowedMethods.length > 0) {
      return Response.json(
        { error: "Method not allowed" },
        { status: 405, headers: { Allow: allowedMethods.join(", ") } },
      );
    }
    return adminJsonError(404, "Not found");
  };
}
