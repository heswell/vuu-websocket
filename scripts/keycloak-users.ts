#!/usr/bin/env bun

type RoleRepresentation = {
  id: string;
  name: string;
  composite?: boolean;
  clientRole?: boolean;
  containerId?: string;
};

type ClientRepresentation = {
  id: string;
  clientId: string;
};

type GroupRepresentation = {
  id: string;
  name: string;
  path?: string;
};

type UserRepresentation = {
  id: string;
  username: string;
  email?: string;
  enabled?: boolean;
};

const keycloakBaseUrl = (process.env.KEYCLOAK_URL ?? "https://localhost:8080").replace(
  /\/$/,
  "",
);
const allowSelfSignedCert =
  (process.env.KEYCLOAK_ALLOW_SELF_SIGNED_CERT ?? "true").toLowerCase() === "true";
const useInsecureTls = keycloakBaseUrl.startsWith("https://") && allowSelfSignedCert;
const realm = process.env.KEYCLOAK_REALM ?? "vuu";
const adminUsername = process.env.KEYCLOAK_ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD ?? "admin";
const userPassword = process.env.KEYCLOAK_USER_PASSWORD ?? "password";

type BunFetchInit = RequestInit & {
  tls?: {
    rejectUnauthorized?: boolean;
  };
};

const users = [
  { username: "trader1", email: "trader1@vuu.com", groups: ["BASKET_TRADE"] },
  { username: "trader2", email: "trader2@vuu.com", groups: ["BASKET_TRADE"] },
  {
    username: "admin",
    email: "admin@vuu.com",
    groups: ["MODULES_ADMIN", "USERS_ADMIN"],
  },
] as const;

const clientRoles = {
  "vuu-portal-server": ["users.view", "users.admin"],
  "vuu-module-discovery-server": [
    "modules.view",
    "modules.edit",
  ],
  "vuu-basket-trading-server": ["basket.view", "basket.trade"],
} as const;

const legacyRealmRoleNames = [
  "basket.view",
  "basket.trade",
  "data.view",
  "users.view",
  "users.admin",
] as const;

type ClientId = keyof typeof clientRoles;
type ClientRoleRef = {
  clientId: ClientId;
  roleName: string;
};

const groupRoles: Record<string, readonly ClientRoleRef[]> = {
  BASKET_VIEW: [
    { clientId: "vuu-basket-trading-server", roleName: "basket.view" },
  ],
  BASKET_TRADE: [
    { clientId: "vuu-basket-trading-server", roleName: "basket.view" },
    { clientId: "vuu-basket-trading-server", roleName: "basket.trade" },
  ],
  MODULES_ADMIN: [
    { clientId: "vuu-module-discovery-server", roleName: "modules.view" },
    { clientId: "vuu-module-discovery-server", roleName: "modules.edit" },
  ],
  USERS_VIEW: [
    { clientId: "vuu-portal-server", roleName: "users.view" },
  ],
  USERS_ADMIN: [
    { clientId: "vuu-portal-server", roleName: "users.view" },
    { clientId: "vuu-portal-server", roleName: "users.admin" },
  ],
};

async function main() {
  if (useInsecureTls) {
    console.warn(
      "[keycloak] TLS certificate verification is disabled (KEYCLOAK_ALLOW_SELF_SIGNED_CERT=true)",
    );
  }

  const accessToken = await getAdminAccessToken();
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  await ensureRealmExists(headers);

  const clients = new Map<ClientId, ClientRepresentation>();
  const roles = new Map<string, RoleRepresentation>();
  for (const [clientId, roleNames] of Object.entries(clientRoles) as [
    ClientId,
    readonly string[],
  ][]) {
    const client = await getClient(clientId, headers);
    clients.set(clientId, client);
    for (const roleName of roleNames) {
      const role = await ensureClientRole(client, roleName, headers);
      roles.set(roleKey(clientId, roleName), role);
    }
  }
  await ensureTokenClientRoleScopes(clients, roles, headers);

  const groups = new Map<string, GroupRepresentation>();
  for (const groupName of Object.keys(groupRoles)) {
    const group = await ensureGroup(groupName, headers);
    groups.set(groupName, group);
  }

  for (const [groupName, roleRefs] of Object.entries(groupRoles)) {
    const rolesByClient = Map.groupBy(roleRefs, ({ clientId }) => clientId);
    for (const [clientId, clientRoleRefs] of rolesByClient) {
      await ensureGroupClientRoles(
        groups.get(groupName)!,
        clients.get(clientId)!,
        clientRoleRefs.map(({ roleName }) => roles.get(roleKey(clientId, roleName))!),
        headers,
      );
    }
  }

  for (const user of users) {
    const createdUser = await upsertUser(user.username, user.email, headers);
    await setUserPassword(createdUser.id, userPassword, headers);

    for (const groupName of user.groups) {
      await addUserToGroup(createdUser.id, groups.get(groupName)!.id, headers);
    }
  }

  console.log(
    `[keycloak] seeded realm ${realm} with ${users.length} users, ${roles.size} client roles and ${Object.keys(groupRoles).length} groups`,
  );
}

async function getAdminAccessToken() {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: "admin-cli",
    username: adminUsername,
    password: adminPassword,
  });

  const response = await keycloakFetch(
    `${keycloakBaseUrl}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to authenticate with Keycloak at ${keycloakBaseUrl}: ${response.status} ${response.statusText}`,
    );
  }

  const tokenResponse = (await response.json()) as { access_token?: string };
  if (!tokenResponse.access_token) {
    throw new Error("Keycloak token response did not include an access_token");
  }

  return tokenResponse.access_token;
}

async function ensureRealmExists(headers: Record<string, string>) {
  const response = await keycloakFetch(`${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}`, {
    headers,
  });

  if (response.status === 404) {
    throw new Error(
      `Realm ${realm} was not found on ${keycloakBaseUrl}. Create it first, then rerun this script.`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Failed to query realm ${realm}: ${response.status} ${response.statusText}`,
    );
  }
}

async function getClient(
  clientId: string,
  headers: Record<string, string>,
) {
  const clients = await requestJson<ClientRepresentation[]>(
    `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/clients?clientId=${encodeURIComponent(clientId)}`,
    { headers },
  );
  const client = clients.find((candidate) => candidate.clientId === clientId);
  if (!client) {
    throw new Error(
      `Client ${clientId} was not found in realm ${realm}. Run keycloak:realm first.`,
    );
  }
  return client;
}

async function ensureClientRole(
  client: ClientRepresentation,
  name: string,
  headers: Record<string, string>,
) {
  const rolesUrl = `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/clients/${encodeURIComponent(client.id)}/roles`;
  const existing = await getOptional<RoleRepresentation>(
    `${rolesUrl}/${encodeURIComponent(name)}`,
    headers,
  );

  if (existing) {
    return existing;
  }

  await requestJson(
    rolesUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ name }),
    },
  );

  const created = await getRequired<RoleRepresentation>(
    `${rolesUrl}/${encodeURIComponent(name)}`,
    headers,
  );

  return created;
}

function roleKey(clientId: ClientId, roleName: string) {
  return `${clientId}:${roleName}`;
}

async function ensureTokenClientRoleScopes(
  clients: Map<ClientId, ClientRepresentation>,
  roles: Map<string, RoleRepresentation>,
  headers: Record<string, string>,
) {
  const discoveryClientId: ClientId = "vuu-module-discovery-server";
  const discoveryClient = clients.get(discoveryClientId);
  if (!discoveryClient) {
    throw new Error(`Client ${discoveryClientId} was not loaded`);
  }
  const portalClient = await getClient("vuu-portal", headers);

  for (const tokenClient of [portalClient, discoveryClient]) {
    for (const [sourceClientId, roleNames] of Object.entries(clientRoles) as [
      ClientId,
      readonly string[],
    ][]) {
      const sourceClient = clients.get(sourceClientId);
      if (!sourceClient) {
        throw new Error(`Client ${sourceClientId} was not loaded`);
      }
      if (sourceClient.id === tokenClient.id) {
        continue;
      }

      const scopedRoles = roleNames.map((roleName) => {
        const role = roles.get(roleKey(sourceClientId, roleName));
        if (!role) {
          throw new Error(
            `Role ${roleName} was not loaded for client ${sourceClientId}`,
          );
        }
        return role;
      });
      await ensureClientRoleScopes(
        tokenClient,
        sourceClient,
        scopedRoles,
        headers,
      );
    }
  }
}

async function ensureClientRoleScopes(
  client: ClientRepresentation,
  roleOwner: ClientRepresentation,
  roles: RoleRepresentation[],
  headers: Record<string, string>,
) {
  const mappingsUrl = `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/clients/${encodeURIComponent(client.id)}/scope-mappings/clients/${encodeURIComponent(roleOwner.id)}`;
  const currentRoles = await requestJson<RoleRepresentation[]>(mappingsUrl, {
    headers,
  });
  const currentRoleNames = new Set(currentRoles.map(({ name }) => name));
  const missingRoles = roles.filter(({ name }) => !currentRoleNames.has(name));
  if (missingRoles.length === 0) {
    return;
  }

  await requestJson(mappingsUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(missingRoles),
  });
}

async function ensureGroup(name: string, headers: Record<string, string>) {
  const groups = await requestJson<GroupRepresentation[]>(
    `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/groups`,
    { headers },
  );

  const existing = groups.find((group) => group.name === name);
  if (existing) {
    return existing;
  }

  await requestJson(
    `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/groups`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ name }),
    },
  );

  const createdGroups = await requestJson<GroupRepresentation[]>(
    `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/groups`,
    { headers },
  );

  const created = createdGroups.find((group) => group.name === name);
  if (!created) {
    throw new Error(`Group ${name} was not returned after creation`);
  }

  return created;
}

async function ensureGroupClientRoles(
  group: GroupRepresentation,
  client: ClientRepresentation,
  roles: RoleRepresentation[],
  headers: Record<string, string>,
) {
  const mappingsUrl = `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/groups/${encodeURIComponent(group.id)}/role-mappings/clients/${encodeURIComponent(client.id)}`;
  const currentRoles = await requestJson<RoleRepresentation[]>(
    mappingsUrl,
    { headers },
  );

  const currentRoleNames = new Set(currentRoles.map((role) => role.name));
  const missingRoles = roles.filter((role) => !currentRoleNames.has(role.name));

  if (missingRoles.length === 0) {
    return;
  }

  await requestJson(
    mappingsUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify(missingRoles),
    },
  );
}

async function upsertUser(
  username: string,
  email: string,
  headers: Record<string, string>,
) {
  const existingUsers = await requestJson<UserRepresentation[]>(
    `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/users?username=${encodeURIComponent(username)}&exact=true`,
    { headers },
  );

  const existing = existingUsers[0];
  const payload = {
    username,
    email,
    enabled: true,
    emailVerified: true,
  };

  if (!existing) {
    await requestJson(
      `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/users`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      },
    );

    const createdUsers = await requestJson<UserRepresentation[]>(
      `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/users?username=${encodeURIComponent(username)}&exact=true`,
      { headers },
    );

    const created = createdUsers[0];
    if (!created) {
      throw new Error(`User ${username} was not returned after creation`);
    }

    return created;
  }

  await requestJson(
    `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(existing.id)}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify(payload),
    },
  );

  return existing;
}

async function setUserPassword(
  userId: string,
  password: string,
  headers: Record<string, string>,
) {
  await requestJson(
    `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}/reset-password`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        type: "password",
        value: password,
        temporary: false,
      }),
    },
  );
}

async function addUserToGroup(
  userId: string,
  groupId: string,
  headers: Record<string, string>,
) {
  await requestJson(
    `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}/groups/${encodeURIComponent(groupId)}`,
    {
      method: "PUT",
      headers,
    },
  );
}

async function getOptional<T>(url: string, headers: Record<string, string>) {
  const response = await keycloakFetch(url, { headers });
  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function getRequired<T>(url: string, headers: Record<string, string>) {
  const value = await getOptional<T>(url, headers);
  if (value === undefined) {
    throw new Error(`Expected resource not found: ${url}`);
  }

  return value;
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  const response = await keycloakFetch(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Request failed for ${url}: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function keycloakFetch(url: string, init: RequestInit = {}) {
  const requestInit: BunFetchInit = { ...init };
  if (useInsecureTls) {
    requestInit.tls = {
      ...(requestInit.tls ?? {}),
      rejectUnauthorized: false,
    };
  }

  return fetch(url, requestInit);
}

await main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

export { };