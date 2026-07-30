#!/usr/bin/env bun

// Keycloak configuration
const KEYCLOAK_URL = "https://localhost:8080";
const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "admin";
const REALM_NAME = "vuu-portal-realm";
const CLIENT_NAME = "vuu-portal";
const CLIENT_PORT = 5002;
const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;

console.log("🔐 Creating Keycloak realm and client...\n");

async function main() {
  try {
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

    // Step 3: Create client
    console.log(`3️⃣  Creating client '${CLIENT_NAME}'...`);
    const clientResponse = await fetch(
      `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: CLIENT_NAME,
          name: "Vuu Portal Application",
          enabled: true,
          public: true,
          rootUrl: CLIENT_URL,
          baseUrl: CLIENT_URL,
          redirectUris: [`${CLIENT_URL}/*`],
          webOrigins: [CLIENT_URL],
          standardFlowEnabled: true,
          implicitFlowEnabled: false,
          directAccessGrantsEnabled: true,
        }),
      }
    );

    if (clientResponse.status === 409) {
      console.log("⚠️  Client already exists\n");
    } else if (clientResponse.ok) {
      const clientData = await clientResponse.json();
      console.log(`✅ Client created with ID: ${clientData.id}\n`);
    } else {
      const errorData = await clientResponse.text();
      throw new Error(
        `Failed to create client: ${clientResponse.status} ${errorData}`
      );
    }

    // Success
    console.log("🎉 Setup complete!");
    console.log(`Realm: ${REALM_NAME}`);
    console.log(`Client: ${CLIENT_NAME}`);
    console.log(`Portal URL: ${CLIENT_URL}`);
    console.log(
      `\nAccess admin console at: ${KEYCLOAK_URL}/admin/`
    );
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
