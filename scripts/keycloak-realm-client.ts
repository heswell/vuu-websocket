#!/usr/bin/env bun

// Keycloak configuration
const KEYCLOAK_URL = "https://localhost:8080";
const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "admin";
const REALM_NAME = "vuu";
const CLIENT_NAME = "vuu-portal";
const SERVER_CLIENT_NAMES = [
  "vuu-portal-server",
  "vuu-module-discovery-server",
  "vuu-basket-trading-server",
] as const;
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

    // Ensure portal-issued access tokens include all server clients as audiences.
    console.log(
      `3️⃣a Enabling server audiences on '${CLIENT_NAME}' tokens...`
    );
    await ensurePortalClientIncludesServerAudiences(
      token,
      portalClient.id,
      SERVER_CLIENT_NAMES,
    );
    console.log("✅ Audience mapper configured\n");

    // Step 4: Create or update confidential server clients.
    console.log("4️⃣  Creating/updating confidential server clients...");
    const serverClientSecrets: Array<{ clientId: string; secret: string }> = [];
    for (const serverClientName of SERVER_CLIENT_NAMES) {
      const secret = await ensureServerClient(token, serverClientName);
      serverClientSecrets.push({ clientId: serverClientName, secret });
    }
    console.log("✅ Confidential server clients ready\n");

    // Success
    console.log("🎉 Setup complete!");
    console.log(`Realm: ${REALM_NAME}`);
    console.log(`Client: ${CLIENT_NAME}`);
    console.log(`Server Clients: ${SERVER_CLIENT_NAMES.join(", ")}`);
    for (const serverClient of serverClientSecrets) {
      console.log(`✅ ${serverClient.clientId} secret: ${serverClient.secret}`);
    }
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

async function ensureStandardTokenExchangeEnabled(
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
      `Failed to load client '${internalClientId}' for update: ${getResponse.status} ${errorData}`
    );
  }

  const clientRepresentation = (await getResponse.json()) as {
    attributes?: Record<string, string>;
    [key: string]: unknown;
  };

  clientRepresentation.attributes = {
    ...(clientRepresentation.attributes ?? {}),
    "standard.token.exchange.enabled": "true",
  };

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
      `Failed to enable token exchange for client '${internalClientId}': ${updateResponse.status} ${errorData}`
    );
  }
}

async function ensurePortalClientIncludesServerAudience(
  token: string,
  internalClientId: string,
  serverClientName: string,
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

  type ProtocolMapper = {
    name?: string;
    protocol?: string;
    protocolMapper?: string;
    consentRequired?: boolean;
    config?: Record<string, string>;
    [key: string]: unknown;
  };

  const clientRepresentation = (await getResponse.json()) as {
    protocolMappers?: ProtocolMapper[];
    [key: string]: unknown;
  };

  const mapperTemplate: ProtocolMapper = {
    name: `audience-${serverClientName}`,
    protocol: "openid-connect",
    protocolMapper: "oidc-audience-mapper",
    consentRequired: false,
    config: {
      "included.client.audience": serverClientName,
      "id.token.claim": "false",
      "access.token.claim": "true",
      "introspection.token.claim": "true",
    },
  };

  const currentMappers = clientRepresentation.protocolMappers ?? [];
  const mapperIndex = currentMappers.findIndex(
    (mapper) =>
      mapper.protocolMapper === "oidc-audience-mapper" &&
      mapper.config?.["included.client.audience"] === serverClientName,
  );

  if (mapperIndex >= 0) {
    const existingMapper = currentMappers[mapperIndex];
    currentMappers[mapperIndex] = {
      ...existingMapper,
      ...mapperTemplate,
      config: {
        ...(existingMapper.config ?? {}),
        ...(mapperTemplate.config ?? {}),
      },
    };
  } else {
    currentMappers.push(mapperTemplate);
  }

  clientRepresentation.protocolMappers = currentMappers;

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
      `Failed to configure audience mapper for client '${internalClientId}': ${updateResponse.status} ${errorData}`
    );
  }
}

async function ensurePortalClientIncludesServerAudiences(
  token: string,
  internalClientId: string,
  serverClientNames: readonly string[],
) {
  for (const serverClientName of serverClientNames) {
    await ensurePortalClientIncludesServerAudience(
      token,
      internalClientId,
      serverClientName,
    );
  }
}

async function ensureServerClient(token: string, serverClientName: string) {
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
        frontchannelLogout: false,
        attributes: {
          "standard.token.exchange.enabled": "true",
        },
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

  console.log(`   • Enabling standard token exchange for '${serverClientName}'...`);
  await ensureStandardTokenExchangeEnabled(token, serverClient.id);

  console.log(`   • Fetching secret for '${serverClientName}'...`);
  return await fetchClientSecret(token, serverClient.id, serverClientName);
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