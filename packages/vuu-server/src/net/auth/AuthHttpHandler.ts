import { HttpRequestHandler } from "../../core/VuuServerOptions";
import {
  AuthenticationProviders,
  AuthProvider,
  CredentialAuthProvider,
} from "./AuthProvider";
import { authenticateBearerRequest } from "./BearerTokenAuthentication";
import {
  AuthenticationError,
  AuthenticationUnavailableError,
  InvalidAuthenticationRequestError,
} from "./AuthenticationErrors";
import { LoginTokenService } from "./LoginTokenService";
import { getLogger } from "@heswell/service-utils";
import {
  createCorsHeaders,
  isOriginAllowed,
  parseAllowedOrigins,
  WILDCARD_ORIGIN,
} from "../http/CorsOrigins";

const log = getLogger("vuu.auth");

export type HttpHandlerOptions = {
  /**
   * @deprecated use `allowedOrigins`. A single origin or a comma-separated
   * list; merged with `allowedOrigins`.
   */
  allowedOrigin?: string;
  /**
   * Browser origins allowed to call the endpoint. A matching request `Origin`
   * is echoed back. `"*"` allows any origin, without credentials. Defaults to
   * `"*"` when neither option is given.
   */
  allowedOrigins?: readonly string[];
  path?: string;
  profiles?: Record<string, AuthenticationProviders>;
};

type Credentials = {
  username?: string;
  password?: string;
};

export function createAuthHttpHandler(
  authProviders: AuthenticationProviders,
  loginTokenService: LoginTokenService,
  {
    allowedOrigin,
    allowedOrigins: allowedOriginList,
    path = "/api/authn",
    profiles = {},
  }: HttpHandlerOptions = {},
): HttpRequestHandler {
  validateAuthPath(path);
  validateProfiles(profiles);
  const configuredOrigins = [
    ...parseAllowedOrigins(allowedOriginList),
    ...parseAllowedOrigins(allowedOrigin),
  ];
  const allowedOrigins =
    configuredOrigins.length === 0
      ? [WILDCARD_ORIGIN]
      : configuredOrigins.filter((o, i) => configuredOrigins.indexOf(o) === i);

  return async (req, url) => {
    const profileName =
      url.pathname === path
        ? ""
        : url.pathname.startsWith(`${path}/`)
          ? url.pathname.slice(path.length + 1)
          : undefined;
    if (profileName === undefined) {
      return undefined;
    }
    const selectedProviders =
      profileName === "" ? authProviders : profiles[profileName];
    if (!selectedProviders || profileName.includes("/")) {
      return Response.json(
        { error: "Authentication profile not found" },
        { status: 404, headers: createCorsHeaders(req, allowedOrigins) },
      );
    }

    const corsHeaders = createCorsHeaders(req, allowedOrigins);

    if (req.method === "OPTIONS") {
      const requestOrigin = req.headers.get("Origin");
      if (requestOrigin && !isOriginAllowed(requestOrigin, allowedOrigins)) {
        log.debug(`CORS preflight refused for origin ${requestOrigin}`);
        return new Response(null, { status: 403, headers: corsHeaders });
      }
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Max-Age": "600",
        },
      });
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed", path }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    try {
      const vuuUser = req.headers.has("Authorization")
        ? await authenticateBearer(selectedProviders, req)
        : await authenticateCredentials(selectedProviders.credentials, req);
      let token: string;
      try {
        token = loginTokenService.getToken(vuuUser);
      } catch {
        log.error(`VUU token issuance failed for ${path}`);
        return new Response(JSON.stringify({ error: "Unable to issue token" }), {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
      }

      return new Response(JSON.stringify({ token }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "vuu-auth-token": token,
        },
      });
    } catch (error: unknown) {
      const status =
        error instanceof SyntaxError ||
        error instanceof InvalidAuthenticationRequestError
          ? 400
          : error instanceof AuthenticationUnavailableError
            ? 503
            : 401;
      log.warn(
        `Authentication failed for ${path} status=${status}`,
      );
      return new Response(
        JSON.stringify({
          error:
            status === 400
              ? "Invalid request"
              : status === 503
                ? "Authentication service unavailable"
                : "Authentication failed",
        }),
        {
          status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  };
}

async function authenticateBearer(
  providers: AuthenticationProviders,
  request: Request,
) {
  if (!providers.bearerToken) {
    throw new AuthenticationError("Bearer authentication is not configured");
  }
  return authenticateBearerRequest(providers.bearerToken, request);
}

async function authenticateCredentials(
  provider: CredentialAuthProvider | undefined,
  req: Request,
) {
  if (!provider) {
    throw new AuthenticationError(
      "Username/password authentication is not configured",
    );
  }

  const body = await req.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidAuthenticationRequestError(
      "Expected a JSON credentials object",
    );
  }
  const credentials = body as Credentials;
  if (
    (credentials.username !== undefined &&
      typeof credentials.username !== "string") ||
    (credentials.password !== undefined &&
      typeof credentials.password !== "string")
  ) {
    throw new InvalidAuthenticationRequestError(
      "Credential fields must be strings",
    );
  }
  const username = credentials.username?.trim();
  const password = credentials.password ?? "";
  if (!username) {
    throw new AuthenticationError("username is required");
  }
  if (!password && !provider.allowsEmptyPassword) {
    throw new AuthenticationError("password is required");
  }
  return provider.authenticate(username, password);
}

function validateAuthPath(path: string) {
  if (
    !path.startsWith("/") ||
    path.length === 1 ||
    path.endsWith("/") ||
    path.includes("?") ||
    path.includes("#") ||
    path.includes("://")
  ) {
    throw new Error(
      `Invalid authentication path '${path}'. Expected an absolute URL path without a trailing slash, query, or fragment.`,
    );
  }
}

function validateProfiles(profiles: Record<string, AuthenticationProviders>) {
  for (const name of Object.keys(profiles)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      throw new Error(`Invalid authentication profile name '${name}'`);
    }
  }
}

export function createHttpHandler(
  authProvider: AuthProvider,
  loginTokenService: LoginTokenService,
  options: HttpHandlerOptions = {},
): HttpRequestHandler {
  return createAuthHttpHandler(
    {
      credentials: authProvider,
      bearerToken: authProvider.authenticateBearerToken
        ? {
            authenticateBearerToken:
              authProvider.authenticateBearerToken.bind(authProvider),
          }
        : undefined,
    },
    loginTokenService,
    options,
  );
}

export { createCorsHeaders };
