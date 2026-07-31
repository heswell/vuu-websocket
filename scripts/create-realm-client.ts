#!/usr/bin/env bun

const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "https://localhost:8080";
const ADMIN_USER = process.env.KEYCLOAK_ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD ?? "admin";
const REALM_NAME = process.env.KEYCLOAK_REALM ?? "vuu";
const CLIENT_NAME = process.env.KEYCLOAK_PORTAL_CLIENT_ID ?? "vuu-portal";
const CLIENT_SECRET =
  process.env.KEYCLOAK_PORTAL_CLIENT_SECRET ?? "vuu-portal-secret";

console.log("🔐 Creating Keycloak realm and client...\n");

async function main() {
  try {
    if (!CLIENT_SECRET) {
      throw new Error("KEYCLOAK_PORTAL_CLIENT_SECRET must not be empty");
    }

    // Step 1: Get access token
    console.log("1️⃣  Getting admin access token...");
    const tokenResponse = await fetch(
      `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: "admin-cli",
          username: ADMIN_USER,
          password: ADMIN_PASSWORD,
          grant_type: "password",
        }),
      }
    );

    if (!tokenResponse.ok) {
      throw new Error(
        `Failed to get token: ${tokenResponse.status} ${tokenResponse.statusText}`
      );
    }

    const tokenData = await tokenResponse.json();
    const token = tokenData.access_token;

    if (!token) {
      throw new Error("No access token in response");
    }
    console.log("✅ Got access token\n");

    // Step 2: Create realm
    console.log(`2️⃣  Creating realm '${REALM_NAME}'...`);
    const realmResponse = await fetch(`${KEYCLOAK_URL}/admin/realms`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        realm: REALM_NAME,
        displayName: "Vuu Portal Realm",
        enabled: true,
      }),
    });

    if (realmResponse.status === 409) {
      console.log("⚠️  Realm already exists, continuing...\n");
    } else if (realmResponse.ok) {
      console.log("✅ Realm created\n");
    } else {
      const errorData = await realmResponse.text();
      throw new Error(
        `Failed to create realm: ${realmResponse.status} ${errorData}`
      );
    }

    // Step 3: Create or update the server-side client used for token introspection.
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const clientsResponse = await fetch(
      `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM_NAME)}/clients?clientId=${encodeURIComponent(CLIENT_NAME)}`,
      { headers },
    );
    if (!clientsResponse.ok) {
      throw new Error(
        `Failed to query client: ${clientsResponse.status} ${await clientsResponse.text()}`,
      );
    }

    const clients = (await clientsResponse.json()) as Array<{ id: string; clientId: string }>;
    const existing = clients.find((client) => client.clientId === CLIENT_NAME);
    const clientConfig = {
      clientId: CLIENT_NAME,
      name: "VUU Portal Server",
      enabled: true,
      publicClient: false,
      clientAuthenticatorType: "client-secret",
      secret: CLIENT_SECRET,
      directAccessGrantsEnabled: true,
      standardFlowEnabled: false,
      implicitFlowEnabled: false,
      serviceAccountsEnabled: false,
    };
    const clientResponse = await fetch(
      existing
        ? `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM_NAME)}/clients/${encodeURIComponent(existing.id)}`
        : `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM_NAME)}/clients`,
      {
        method: existing ? "PUT" : "POST",
        headers,
        body: JSON.stringify(clientConfig),
      },
    );
    if (!clientResponse.ok) {
      throw new Error(
        `Failed to configure client: ${clientResponse.status} ${await clientResponse.text()}`,
      );
    }
    console.log(`✅ Client '${CLIENT_NAME}' configured for token introspection\n`);

    // Success
    console.log("🎉 Setup complete!");
    console.log(`Realm: ${REALM_NAME}`);
    console.log(`Client: ${CLIENT_NAME}`);
    console.log(
      `\nAccess admin console at: ${KEYCLOAK_URL}/admin/`
    );
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
