import { describe, expect, test } from "bun:test";
import {
  VuuUser,
  VuuUserWithAuthorizations,
} from "../src/core/auths/VuuUser";
import { createHttpHandler } from "../src/net/auth/AuthHttpHandler";
import { LoginTokenService } from "../src/net/auth/LoginTokenService";

const CLIENT_ORIGIN = "http://localhost:5002";

function createHandler(
  authenticateBearerToken?: (token: string) => Promise<VuuUser>,
) {
  return createHttpHandler(
    {
      authenticate: async (username) =>
        VuuUserWithAuthorizations(username, []),
      authenticateBearerToken,
    },
    LoginTokenService(),
    { allowedOrigin: CLIENT_ORIGIN },
  );
}

describe("AuthnHttpHandler CORS", () => {
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
    expect(response?.headers.get("Access-Control-Allow-Methods")).toContain(
      "POST",
    );
  });

  test("exposes the authentication token to the configured client", async () => {
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
    expect(response?.headers.get("Access-Control-Allow-Origin")).toBe(
      CLIENT_ORIGIN,
    );
    expect(response?.headers.get("Access-Control-Expose-Headers")).toBe(
      "vuu-auth-token",
    );
    expect(response?.headers.get("vuu-auth-token")).not.toBeNull();
    expect(await response?.json()).toEqual({
      token: response?.headers.get("vuu-auth-token"),
    });
  });

  test("authenticates a bearer token in preference to submitted credentials", async () => {
    const authenticateBearerToken = async (token: string) =>
      VuuUserWithAuthorizations("keycloak-user", ["portal.admin"]);
    const request = new Request("https://localhost:8443/api/authn", {
      headers: {
        Authorization: "Bearer: keycloak-issued-jwt",
        Origin: CLIENT_ORIGIN,
      },
    });

    const response = await createHandler(authenticateBearerToken)(
      request,
      new URL(request.url),
    );

    expect(response?.status).toBe(200);
    const vuuToken = response?.headers.get("vuu-auth-token");
    expect(vuuToken).not.toBeNull();
    const [payload] = vuuToken!.split(".");
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toMatchObject(
      {
        name: "keycloak-user",
        authorizations: ["portal.admin"],
      },
    );
  });

  test("does not fall back to credentials when a bearer token is invalid", async () => {
    const request = new Request("https://localhost:8443/api/authn", {
      method: "POST",
      headers: {
        Authorization: "not-a-bearer-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: "admin", password: "admin" }),
    });

    const response = await createHandler()(request, new URL(request.url));

    expect(response?.status).toBe(401);
    expect(await response?.json()).toMatchObject({
      error: "Authentication failed",
    });
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
