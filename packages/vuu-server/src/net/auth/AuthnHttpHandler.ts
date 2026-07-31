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
          "Access-Control-Allow-Headers": "Content-Type, vuu-auth-token",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
      });
    }

    if (req.method !== "POST") {
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
      const body = (await req.json()) as Credentials;
      const username = body.username?.trim();
      const password = body.password;

      if (!username || !password) {
        console.warn(
          `[AuthnHttpHandler] Authentication failed: missing username/password for /api/authn`,
        );
        return new Response(
          JSON.stringify({ error: "username and password are required" }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      const vuuUser = await provider.authenticate(username, password);
      const token = loginTokenService.getToken(vuuUser);

      return new Response(null, {
        status: 200,
        headers: {
          ...corsHeaders,
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
