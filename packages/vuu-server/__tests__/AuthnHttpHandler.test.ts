import { describe, expect, test } from "bun:test";
import { VuuUserWithAuthorizations } from "../src/core/auths/VuuUser";
import { createAuthnHttpHandler } from "../src/net/auth/AuthnHttpHandler";
import { LoginTokenService } from "../src/net/auth/LoginTokenService";

const CLIENT_ORIGIN = "http://localhost:5002";

function createHandler() {
  return createAuthnHttpHandler(
    {
      authenticate: async (username) =>
        VuuUserWithAuthorizations(username, []),
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
