import { LoginTokenService } from "./LoginTokenService";
import { AuthnProvider } from "./AuthnProvider";

const BASE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
};

type Credentials = {
  username?: string;
  password?: string;
};

export function createAuthnHttpHandler(
  provider: AuthnProvider,
  loginTokenService: LoginTokenService,
) {
  return async (req: Request, url: URL) => {
    if (url.pathname !== "/api/authn") {
      return undefined;
    }

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...BASE_HEADERS,
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
            ...BASE_HEADERS,
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
              ...BASE_HEADERS,
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
          ...BASE_HEADERS,
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
            ...BASE_HEADERS,
            "Content-Type": "application/json",
          },
        },
      );
    }
  };
}
