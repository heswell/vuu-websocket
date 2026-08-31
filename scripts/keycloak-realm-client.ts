#!/usr/bin/env bun

import {
  reconcileServerClientConfiguration,
  reconcilePortalClientConfiguration,
  RETIRED_SERVER_CLIENT_NAMES,
  SERVER_CLIENT_NAMES,
  SERVER_CLIENT_SECRETS,
  resolveKeycloakClientSecret,
  type ProtocolMapper,
} from "./keycloak-client-config";

// Keycloak configuration
const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "https://localhost:8080";
const ADMIN_USER = process.env.KEYCLOAK_ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD ?? "admin";
const REALM_NAME = process.env.KEYCLOAK_REALM ?? "vuu";
const CLIENT_NAME = "vuu-portal";
const AUTHORIZATION_HEADER = "Authorization";
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

    // Step 4: Create or update confidential server clients.
    console.log("4️⃣  Creating/updating confidential server clients...");
    for (const serverClientName of SERVER_CLIENT_NAMES) {
      await ensureServerClient(
        token,
        serverClientName,
        resolveKeycloakClientSecret(
          serverClientName,
          SERVER_CLIENT_SECRETS[serverClientName],
        ),
      );
    }
    console.log("✅ Confidential server clients and self audiences ready\n");

    // Configure audiences after the target clients exist and remove retired remotes.
    console.log(
      `4️⃣a Reconciling server audiences on '${CLIENT_NAME}' tokens...`
    );
    await reconcilePortalClientServerAudiences(token, portalClient.id);
    console.log("✅ Audience mappers reconciled\n");

    console.log("4️⃣b Removing retired confidential server clients...");
    for (const retiredClientName of RETIRED_SERVER_CLIENT_NAMES) {
      await removeClientIfPresent(token, retiredClientName);
    }
    console.log("✅ Retired server clients removed\n");

    // Success
    console.log("🎉 Setup complete!");
    console.log(`Realm: ${REALM_NAME}`);
    console.log(`Client: ${CLIENT_NAME}`);
    console.log(`Server Clients: ${SERVER_CLIENT_NAMES.join(", ")}`);
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

function keycloakHeaders(token: string) {
  return {
    [AUTHORIZATION_HEADER]: ["Bearer", token].join(" "),
  };
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
    },
  );

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(
      `Failed to lookup client '${clientId}': ${response.status} ${errorData}`,
    );
  }

  const clients = (await response.json()) as Array<{ id?: string }>;
  return clients[0];
}

async function removeClientIfPresent(token: string, clientId: string) {
  const client = await lookupClientByClientId(token, clientId);
  if (!client?.id) {
    console.log(`   • Retired client '${clientId}' is already absent`);
    return;
  }

  const response = await keycloakFetch(
    `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${client.id}`,
    {
      method: "DELETE",
      headers: keycloakHeaders(token),
    },
  );
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(
      `Failed to remove retired client '${clientId}': ${response.status} ${errorData}`,
    );
  }
  console.log(`   • Retired client '${clientId}' removed`);
}

async function reconcileServerClient(
  token: string,
  internalClientId: string,
  clientId: (typeof SERVER_CLIENT_NAMES)[number],
  clientSecret?: string,
) {
  const getResponse = await keycloakFetch(
    `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${internalClientId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!getResponse.ok) {
    const errorData = await getResponse.text();
    throw new Error(
      `Failed to load client '${internalClientId}' for update: ${getResponse.status} ${errorData}`
    );
  }

  const clientRepresentation = reconcileServerClientConfiguration(
    await getResponse.json(),
    clientId,
    clientSecret,
  );

  const updateResponse = await keycloakFetch(
    `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${internalClientId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(clientRepresentation),
    }
  );

  if (!updateResponse.ok) {
    const errorData = await updateResponse.text();
    throw new Error(
      `Failed to reconcile confidential client '${clientId}': ${updateResponse.status} ${errorData}`,
    );
  }
}

async function reconcilePortalClientServerAudiences(
  token: string,
  internalClientId: string,
) {
  const getResponse = await keycloakFetch(
    `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${internalClientId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!getResponse.ok) {
    const errorData = await getResponse.text();
    throw new Error(
      `Failed to load portal client '${internalClientId}' for update: ${getResponse.status} ${errorData}`
    );
  }

  const clientRepresentation = (await getResponse.json()) as {
    protocolMappers?: ProtocolMapper[];
    [key: string]: unknown;
  };

  const reconciledClient = reconcilePortalClientConfiguration(
    clientRepresentation,
  );

  const updateResponse = await keycloakFetch(
    `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${internalClientId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reconciledClient),
    }
  );

  if (!updateResponse.ok) {
    const errorData = await updateResponse.text();
    throw new Error(
      `Failed to configure audience mapper for client '${internalClientId}': ${updateResponse.status} ${errorData}`
    );
  }
}

async function ensureServerClient(
  token: string,
  serverClientName: (typeof SERVER_CLIENT_NAMES)[number],
  clientSecret?: string,
) {
  console.log(`   • Creating confidential client '${serverClientName}'...`);
  const createResponse = await keycloakFetch(
    `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId: serverClientName,
        name: serverClientName,
        enabled: true,
        protocol: "openid-connect",
        publicClient: false,
        bearerOnly: false,
        standardFlowEnabled: false,
        implicitFlowEnabled: false,
        directAccessGrantsEnabled: false,
        serviceAccountsEnabled: true,
        fullScopeAllowed: false,
        frontchannelLogout: false,
        attributes: {
          "standard.token.exchange.enabled": "true",
        },
        ...(clientSecret ? { secret: clientSecret } : {}),
      }),
    }
  );

  if (createResponse.status === 409) {
    console.log(`   • '${serverClientName}' already exists`);
  } else if (createResponse.ok) {
    console.log(`   • '${serverClientName}' created`);
  } else {
    const errorData = await createResponse.text();
    throw new Error(
      `Failed to create confidential server client '${serverClientName}': ${createResponse.status} ${errorData}`
    );
  }

  const serverClient = await lookupClientByClientId(token, serverClientName);
  if (!serverClient?.id) {
    throw new Error(
      `Confidential server client '${serverClientName}' not found after create`
    );
  }

  console.log(
    `   • Reconciling token exchange and self audience for '${serverClientName}'...`,
  );
  await reconcileServerClient(
    token,
    serverClient.id,
    serverClientName,
    clientSecret,
  );

  console.log(`   • '${serverClientName}' configuration reconciled`);
}

async function fetchClientSecret(
  token: string,
  internalClientId: string,
  clientId: string,
) {
  const secretResponse = await keycloakFetch(
    `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${internalClientId}/client-secret`,
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
      `Failed to fetch confidential server client secret for '${clientId}': ${secretResponse.status} ${errorData}`
    );
  }

  const secretData = (await secretResponse.json()) as { value?: string };
  if (!secretData.value) {
    throw new Error(
      `Confidential server client secret missing from response for '${clientId}'`
    );
  }

  return secretData.value;
}