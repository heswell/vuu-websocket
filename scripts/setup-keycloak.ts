#!/usr/bin/env bun

type RoleRepresentation = {
  id: string;
  name: string;
  composite?: boolean;
  clientRole?: boolean;
  containerId?: string;
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

const keycloakBaseUrl = (process.env.KEYCLOAK_URL ?? "http://localhost:8080").replace(
  /\/$/,
  "",
);
const realm = process.env.KEYCLOAK_REALM ?? "vuu";
const adminUsername = process.env.KEYCLOAK_ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD ?? "admin";
const userPassword = process.env.KEYCLOAK_USER_PASSWORD ?? "password";

const users = [
  { username: "trader1", email: "trader1@vuu.com", groups: ["BASKET_TRADE"] },
  { username: "trader2", email: "trader2@vuu.com", groups: ["BASKET_TRADE"] },
  { username: "dev1", email: "dev1@vuu.com", groups: ["DATA_VIEW", "USERS_VIEW"] },
  { username: "dev2", email: "dev2@vuu.com", groups: ["DATA_VIEW", "USERS_VIEW"] },
  { username: "admin", email: "admin@vuu.com", groups: ["USERS_ADMIN"] },
] as const;

const roleNames = [
  "basket.view",
  "basket.trade",
  "data.view",
  "users.view",
  "users.admin",
] as const;

const groupRoleNames: Record<string, readonly string[]> = {
  BASKET_VIEW: ["basket.view"],
  BASKET_TRADE: ["basket.view", "basket.trade"],
  DATA_VIEW: ["data.view"],
  USERS_VIEW: ["users.view"],
  USERS_ADMIN: ["users.view", "users.admin"],
};

async function main() {
  const accessToken = await getAdminAccessToken();
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  await ensureRealmExists(headers);

  const roles = new Map<string, RoleRepresentation>();
  for (const roleName of roleNames) {
    const role = await ensureRole(roleName, headers);
    roles.set(roleName, role);
  }

  const groups = new Map<string, GroupRepresentation>();
  for (const groupName of Object.keys(groupRoleNames)) {
    const group = await ensureGroup(groupName, headers);
    groups.set(groupName, group);
  }

  for (const [groupName, roleNamesForGroup] of Object.entries(groupRoleNames)) {
    await ensureGroupRealmRoles(
      groups.get(groupName)!,
      roleNamesForGroup.map((roleName) => roles.get(roleName)!),
      headers,
    );
  }

  for (const user of users) {
    const createdUser = await upsertUser(user.username, user.email, headers);
    await setUserPassword(createdUser.id, userPassword, headers);

    for (const groupName of user.groups) {
      await addUserToGroup(createdUser.id, groups.get(groupName)!.id, headers);
    }
  }

  console.log(
    `[keycloak] seeded realm ${realm} with ${users.length} users, ${roleNames.length} roles and ${Object.keys(groupRoleNames).length} groups`,
  );
}

async function getAdminAccessToken() {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: "admin-cli",
    username: adminUsername,
    password: adminPassword,
  });

  const response = await fetch(
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
  const response = await fetch(`${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}`, {
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

async function ensureRole(name: string, headers: Record<string, string>) {
  const existing = await getOptional<RoleRepresentation>(
    `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/roles/${encodeURIComponent(name)}`,
    headers,
  );

  if (existing) {
    return existing;
  }

  await requestJson(
    `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/roles`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ name }),
    },
  );

  const created = await getRequired<RoleRepresentation>(
    `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/roles/${encodeURIComponent(name)}`,
    headers,
  );

  return created;
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

async function ensureGroupRealmRoles(
  group: GroupRepresentation,
  roles: RoleRepresentation[],
  headers: Record<string, string>,
) {
  const currentRoles = await requestJson<RoleRepresentation[]>(
    `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/groups/${encodeURIComponent(group.id)}/role-mappings/realm`,
    { headers },
  );

  const currentRoleNames = new Set(currentRoles.map((role) => role.name));
  const missingRoles = roles.filter((role) => !currentRoleNames.has(role.name));

  if (missingRoles.length === 0) {
    return;
  }

  await requestJson(
    `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/groups/${encodeURIComponent(group.id)}/role-mappings/realm`,
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
  const response = await fetch(url, { headers });
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
  const response = await fetch(url, init);
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

await main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

export {};