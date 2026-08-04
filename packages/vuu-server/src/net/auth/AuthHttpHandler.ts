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

export type HttpHandlerOptions = {
  allowedOrigin?: string;
  path?: string;
};

type Credentials = {
  username?: string;
  password?: string;
};

export function createAuthHttpHandler(
  authProviders: AuthenticationProviders,
  loginTokenService: LoginTokenService,
  { allowedOrigin = "*", path = "/api/authn" }: HttpHandlerOptions = {},
): HttpRequestHandler {
  validateAuthPath(path);

  return async (req, url) => {
    if (url.pathname !== path) {
      return undefined;
    }

    const corsHeaders = createCorsHeaders(req, allowedOrigin);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
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
        ? await authenticateBearer(authProviders, req)
        : await authenticateCredentials(authProviders.credentials, req);
      let token: string;
      try {
        token = loginTokenService.getToken(vuuUser);
      } catch {
        console.error(`[AuthHttpHandler] VUU token issuance failed for ${path}`);
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
      console.warn(
        `[AuthHttpHandler] Authentication failed for ${path} status=${status}`,
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
  const password = credentials.password;
  if (!username || !password) {
    throw new AuthenticationError("username and password are required");
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

export function createCorsHeaders(req: Request, allowedOrigin: string) {
  const requestOrigin = req.headers.get("Origin");
  const allowRequestOrigin =
    allowedOrigin === "*" || requestOrigin === allowedOrigin;

  return {
    ...(allowRequestOrigin
      ? {
          "Access-Control-Allow-Origin":
            allowedOrigin === "*" ? "*" : allowedOrigin,
        }
      : {}),
    ...(allowedOrigin === "*"
      ? {}
      : {
          "Access-Control-Allow-Credentials": "true",
          Vary: "Origin",
        }),
    "Access-Control-Expose-Headers": "vuu-auth-token",
    "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
  };
}
