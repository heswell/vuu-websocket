import { LoginTokenService } from "./LoginTokenService";
import { AuthnProvider } from "./AuthnProvider";

export type AuthnHttpHandlerOptions = {
  allowedOrigin?: string;
};

type Credentials = {
  username?: string;
  password?: string;
};

export function createAuthnHttpHandler(
  provider: AuthnProvider,
  loginTokenService: LoginTokenService,
  { allowedOrigin = "*" }: AuthnHttpHandlerOptions = {},
) {
  return async (req: Request, url: URL) => {
    if (url.pathname !== "/api/authn") {
      return undefined;
    }

    const corsHeaders = createCorsHeaders(req, allowedOrigin);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          "Access-Control-Allow-Headers":
            "Authorization, Content-Type",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
      });
    }

    if (req.method !== "GET" && req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed", path: "/api/authn" }),
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
      const authorization = req.headers.get("Authorization");
      const vuuUser = authorization
        ? await authenticateBearerToken(provider, authorization)
        : await authenticateCredentials(provider, req);
      const token = loginTokenService.getToken(vuuUser);

      return new Response(JSON.stringify({ token }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "vuu-auth-token": token,
        },
      });
    } catch (error) {
      console.warn(
        `[AuthnHttpHandler] Authentication failed for /api/authn: ${(error as Error).message}`,
      );
      return new Response(
        JSON.stringify({
          error: "Authentication failed",
          message: (error as Error).message,
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  };
}

async function authenticateBearerToken(
  provider: AuthnProvider,
  authorization: string,
) {
  const token = parseBearerToken(authorization);
  if (!provider.authenticateBearerToken) {
    throw new Error("Bearer token authentication is not configured");
  }

  return provider.authenticateBearerToken(token);
}

async function authenticateCredentials(provider: AuthnProvider, req: Request) {
  if (req.method !== "POST") {
    throw new Error("username and password must be submitted with POST");
  }

  const body = (await req.json()) as Credentials;
  const username = body.username?.trim();
  const password = body.password;

  if (!username || !password) {
    throw new Error("username and password are required");
  }

  return provider.authenticate(username, password);
}

function parseBearerToken(authorization: string) {
  const match = /^Bearer:?\s+(.+)$/i.exec(authorization);
  if (!match) {
    throw new Error("Authorization header must contain a bearer token");
  }

  const token = match[1].trim();
  if (!token) {
    throw new Error("Authorization header must contain a bearer token");
  }

  return token;
}

function createCorsHeaders(req: Request, allowedOrigin: string) {
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
