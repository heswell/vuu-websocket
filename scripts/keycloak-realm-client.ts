#!/usr/bin/env bun

// Keycloak configuration
const KEYCLOAK_URL = "https://localhost:8080";
const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "admin";
const REALM_NAME = "vuu";
const CLIENT_NAME = "vuu-portal";
const SERVER_CLIENT_NAME = "vuu-portal-server";
const CLIENT_PORT = 5002;
const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;
const ALLOW_SELF_SIGNED_CERT =
  (process.env.KEYCLOAK_ALLOW_SELF_SIGNED_CERT ?? "true").toLowerCase() ===
  "true";
const USE_INSECURE_TLS =
  KEYCLOAK_URL.startsWith("https://") && ALLOW_SELF_SIGNED_CERT;

type BunFetchInit = RequestInit & {
  tls?: {
    rejectUnauthorized?: boolean;
  };
};

console.log("🔐 Creating Keycloak realm and clients...\n");

async function main() {
  try {
    if (USE_INSECURE_TLS) {
      console.warn(
        "[keycloak] TLS certificate verification is disabled (KEYCLOAK_ALLOW_SELF_SIGNED_CERT=true)",
      );
    }

    // Step 1: Get access token
    console.log("1️⃣  Getting admin access token...");
    const tokenResponse = await keycloakFetch(
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
    const realmResponse = await keycloakFetch(`${KEYCLOAK_URL}/admin/realms`, {
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
    const clientResponse = await keycloakFetch(
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
          publicClient: true,
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
      console.log("✅ Client created\n");
    } else {
      const errorData = await clientResponse.text();
      throw new Error(
        `Failed to create client: ${clientResponse.status} ${errorData}`
      );
    }

    const portalClient = await lookupClientByClientId(token, CLIENT_NAME);
    if (!portalClient?.id) {
      throw new Error("Portal client not found after create");
    }
    console.log(`ℹ️  ${CLIENT_NAME} internal ID: ${portalClient.id}\n`);

    // Step 4: Create confidential server client for token introspection
    console.log(`4️⃣  Creating confidential client '${SERVER_CLIENT_NAME}'...`);
    const serverClientResponse = await keycloakFetch(
      `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: SERVER_CLIENT_NAME,
          name: "Vuu Portal Server",
          enabled: true,
          protocol: "openid-connect",
          publicClient: false,
          bearerOnly: false,
          standardFlowEnabled: false,
          implicitFlowEnabled: false,
          directAccessGrantsEnabled: false,
          serviceAccountsEnabled: true,
          frontchannelLogout: false,
        }),
      }
    );

    if (serverClientResponse.status === 409) {
      console.log("⚠️  Confidential server client already exists\n");
    } else if (serverClientResponse.ok) {
      console.log("✅ Confidential server client created\n");
    } else {
      const errorData = await serverClientResponse.text();
      throw new Error(
        `Failed to create confidential server client: ${serverClientResponse.status} ${errorData}`
      );
    }

    // Step 5: Lookup the confidential client and print its secret.
    console.log(`5️⃣  Fetching secret for '${SERVER_CLIENT_NAME}'...`);
    const serverClientLookupResponse = await keycloakFetch(
      `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients?clientId=${encodeURIComponent(
        SERVER_CLIENT_NAME
      )}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!serverClientLookupResponse.ok) {
      const errorData = await serverClientLookupResponse.text();
      throw new Error(
        `Failed to lookup confidential server client: ${serverClientLookupResponse.status} ${errorData}`
      );
    }

    const serverClients = (await serverClientLookupResponse.json()) as Array<{
      id?: string;
    }>;
    const serverClient = serverClients[0];
    if (!serverClient?.id) {
      throw new Error("Confidential server client not found after create");
    }

    const secretResponse = await keycloakFetch(
      `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${serverClient.id}/client-secret`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!secretResponse.ok) {
      const errorData = await secretResponse.text();
      throw new Error(
        `Failed to fetch confidential server client secret: ${secretResponse.status} ${errorData}`
      );
    }

    const secretData = (await secretResponse.json()) as { value?: string };
    if (!secretData.value) {
      throw new Error("Confidential server client secret missing from response");
    }
    console.log(`✅ ${SERVER_CLIENT_NAME} secret: ${secretData.value}\n`);

    // Success
    console.log("🎉 Setup complete!");
    console.log(`Realm: ${REALM_NAME}`);
    console.log(`Client: ${CLIENT_NAME}`);
    console.log(`Server Client: ${SERVER_CLIENT_NAME}`);
    console.log(`Portal URL: ${CLIENT_URL}`);
    console.log(
      `\nAccess admin console at: ${KEYCLOAK_URL}/admin/`
    );
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function keycloakFetch(url: string, init: RequestInit = {}) {
  const requestInit: BunFetchInit = { ...init };
  if (USE_INSECURE_TLS) {
    requestInit.tls = {
      ...(requestInit.tls ?? {}),
      rejectUnauthorized: false,
    };
  }
  return fetch(url, requestInit);
}

main();


async function lookupClientByClientId(token: string, clientId: string) {
  const response = await keycloakFetch(
    `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients?clientId=${encodeURIComponent(clientId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(
      `Failed to lookup client '${clientId}': ${response.status} ${errorData}`
    );
  }

  const clients = (await response.json()) as Array<{ id?: string }>;
  return clients[0];
}