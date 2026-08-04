import { describe, expect, test } from "bun:test";
import { VuuUserWithAuthorizations } from "../src/core/auths/VuuUser";
import { createAuthHttpHandler } from "../src/net/auth/AuthHttpHandler";
import { LoginTokenService } from "../src/net/auth/LoginTokenService";
import {
  AuthenticationUnavailableError,
} from "../src/net/auth/AuthenticationErrors";

const CLIENT_ORIGIN = "http://localhost:5002";

function createHandler(
  authenticateBearerToken?: (token: string) => Promise<
    ReturnType<typeof VuuUserWithAuthorizations>
  >,
  path?: string,
) {
  return createAuthHttpHandler(
    {
      bearerToken: authenticateBearerToken
        ? { authenticateBearerToken }
        : undefined,
      credentials: {
        authenticate: async (username) =>
          VuuUserWithAuthorizations(username, []),
      },
    },
    LoginTokenService(),
    { allowedOrigin: CLIENT_ORIGIN, path },
  );
}

describe("AuthnHttpHandler", () => {
  test("handles preflight requests from the configured client", async () => {
    const request = new Request("https://localhost:8443/api/authn", {
      method: "OPTIONS",
      headers: { Origin: CLIENT_ORIGIN },
    });

    const response = await createHandler()(request, new URL(request.url));

    expect(response?.status).toBe(204);
    expect(response?.headers.get("Access-Control-Allow-Origin")).toBe(
      CLIENT_ORIGIN,
    );
    expect(response?.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true",
    );
    expect(response?.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST, OPTIONS",
    );
  });

  test("exposes a VUU token after credential authentication", async () => {
    const request = new Request("https://localhost:8443/api/authn", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: CLIENT_ORIGIN,
      },
      body: JSON.stringify({ username: "admin", password: "admin" }),
    });

    const response = await createHandler()(request, new URL(request.url));

    expect(response?.status).toBe(200);
    expect(response?.headers.get("Access-Control-Expose-Headers")).toBe(
      "vuu-auth-token",
    );
    expect(await response?.json()).toEqual({
      token: response?.headers.get("vuu-auth-token"),
    });
  });

  test("validates a bearer token in preference to submitted credentials", async () => {
    const authenticateBearerToken = async (token: string) => {
      expect(token).toBe("keycloak-issued-jwt");
      return VuuUserWithAuthorizations("keycloak-user", ["portal.admin"]);
    };
    const request = new Request("https://localhost:8443/api/authn", {
      method: "POST",
      headers: {
        Authorization: "Bearer keycloak-issued-jwt",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: "admin", password: "admin" }),
    });

    const response = await createHandler(authenticateBearerToken)(
      request,
      new URL(request.url),
    );

    expect(response?.status).toBe(200);
    const vuuToken = response?.headers.get("vuu-auth-token");
    const [payload] = vuuToken!.split(".");
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toMatchObject(
      {
        name: "keycloak-user",
        authorizations: ["portal.admin"],
      },
    );
  });

  test("issues a token accepted by the same WebSocket login service", async () => {
    const loginTokenService = LoginTokenService();
    const handler = createAuthHttpHandler(
      {
        bearerToken: {
          authenticateBearerToken: async () =>
            VuuUserWithAuthorizations("keycloak-user", ["portal.admin"]),
        },
      },
      loginTokenService,
    );
    const request = new Request("https://localhost:8443/api/authn", {
      method: "POST",
      headers: { Authorization: "Bearer keycloak-token" },
    });

    const response = await handler(request, new URL(request.url));
    const { token } = (await response?.json()) as { token: string };
    const user = loginTokenService.login({ type: "LOGIN", token });

    expect(user.name).toBe("keycloak-user");
    expect(user.authorizations).toEqual(["portal.admin"]);
  });

  test("uses a configured path instead of the default path", async () => {
    const handler = createHandler(undefined, "/custom/auth");
    const defaultRequest = credentialRequest("/api/authn");
    const customRequest = credentialRequest("/custom/auth");

    expect(
      await handler(defaultRequest, new URL(defaultRequest.url)),
    ).toBeUndefined();
    expect(
      (await handler(customRequest, new URL(customRequest.url)))?.status,
    ).toBe(200);
  });

  test("rejects invalid configured paths", () => {
    expect(() => createHandler(undefined, "api/authn")).toThrow(
      "Invalid authentication path",
    );
    expect(() => createHandler(undefined, "/api/authn/")).toThrow(
      "Invalid authentication path",
    );
  });

  test("does not expose provider error details", async () => {
    const request = new Request("https://localhost:8443/api/authn", {
      method: "POST",
      headers: { Authorization: "Bearer invalid" },
    });
    const response = await createHandler(async () => {
      throw new Error("internal identity provider details");
    })(request, new URL(request.url));

    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({
      error: "Authentication failed",
    });
  });

  test("reports invalid credential input and unavailable authentication distinctly", async () => {
    const invalidRequest = new Request("https://localhost:8443/api/authn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(["not", "credentials"]),
    });
    const invalidResponse = await createHandler()(
      invalidRequest,
      new URL(invalidRequest.url),
    );
    expect(invalidResponse?.status).toBe(400);

    const unavailableRequest = new Request(
      "https://localhost:8443/api/authn",
      {
        method: "POST",
        headers: { Authorization: "Bearer keycloak-token" },
      },
    );
    const unavailableResponse = await createHandler(async () => {
      throw new AuthenticationUnavailableError("Keycloak unavailable");
    })(unavailableRequest, new URL(unavailableRequest.url));
    expect(unavailableResponse?.status).toBe(503);
    expect(await unavailableResponse?.json()).toEqual({
      error: "Authentication service unavailable",
    });
  });

  test("rejects GET requests", async () => {
    const request = new Request("https://localhost:8443/api/authn");
    const response = await createHandler()(request, new URL(request.url));
    expect(response?.status).toBe(405);
  });

  test("does not allow an unconfigured origin", async () => {
    const request = new Request("https://localhost:8443/api/authn", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5003" },
    });

    const response = await createHandler()(request, new URL(request.url));
    expect(response?.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
});

function credentialRequest(path: string) {
  return new Request(`https://localhost:8443${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin" }),
  });
}
