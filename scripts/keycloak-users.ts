#!/usr/bin/env bun

// Reconciles the configured realm's client roles, hierarchical groups, role
// mappings, and seeded users. Users receive access through groups only; run
// keycloak-realm-client.ts first so the realm and clients already exist.

import {
  CLIENT_ROLES,
  GROUP_ROLES,
  MANAGED_CLIENT_ROLE_NAMES,
  planManagedIdChanges,
  planManagedRoleScopeChanges,
  RETIRED_GROUP_NAMES,
  RETIRED_REALM_ROLE_NAMES,
  SEEDED_USERS,
  type ClientId,
} from "./keycloak-user-config";

type RoleRepresentation = {
  id: string;
  name: string;
  composite?: boolean;
  clientRole?: boolean;
  containerId?: string;
};

type ClientRepresentation = {
  id: string;
  clientId: ClientId;
};

type GroupRepresentation = {
  id: string;
  name: string;
  path?: string;
  subGroups?: GroupRepresentation[];
};

type UserRepresentation = {
  id: string;
  username: string;
  email?: string;
  enabled?: boolean;
  emailVerified?: boolean;
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
  for (const [clientId, roleNames] of Object.entries(CLIENT_ROLES) as [
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
  await reconcileTokenClientRoleScopes(clients, roles, headers);
  await removeStaleManagedClientRoles(clients, headers);
  await removeRetiredRealmRoles(headers);

  const groups = new Map<string, GroupRepresentation>();
  for (const groupPath of Object.keys(GROUP_ROLES)) {
    const group = await ensureGroupPath(groupPath, headers);
    groups.set(groupPath, group);
  }

  for (const [groupPath, roleRefs] of Object.entries(GROUP_ROLES)) {
    for (const clientId of Object.keys(CLIENT_ROLES) as ClientId[]) {
      await reconcileGroupClientRoles(
        groups.get(groupPath)!,
        clients.get(clientId)!,
        roleRefs
          .filter((roleRef) => roleRef.clientId === clientId)
          .map(({ roleName }) => roles.get(roleKey(clientId, roleName))!),
        headers,
      );
    }
  }
  await removeRetiredGroups(headers);

  for (const user of SEEDED_USERS) {
    const { user: createdUser, created } = await upsertUser(
      user.username,
      user.email,
      headers,
    );
    if (created) {
      await setUserPassword(createdUser.id, userPassword, headers);
    }

    await reconcileUserGroups(
      createdUser.id,
      user.groups.map((groupPath) => {
        const group = groups.get(groupPath);
        if (!group) {
          throw new Error(`Desired group ${groupPath} was not loaded`);
        }
        return group;
      }),
      groups,
      headers,
    );
  }
  await removeDirectManagedClientRolesFromUsers(clients, headers);

  console.log(
    `[keycloak] seeded realm ${realm} with ${SEEDED_USERS.length} users, ${roles.size} client roles and ${Object.keys(GROUP_ROLES).length} groups`,
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
  clientId: ClientId,
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

async function reconcileTokenClientRoleScopes(
  clients: Map<ClientId, ClientRepresentation>,
  roles: Map<string, RoleRepresentation>,
  headers: Record<string, string>,
) {
  const portalClient = await getClient("vuu-portal", headers);
  const tokenClients = new Map<ClientId, ClientRepresentation>(clients);
  tokenClients.set("vuu-portal", portalClient);
  const changes: Array<{
    mappingsUrl: string;
    tokenClientId: ClientId;
    sourceClientId: ClientId;
    add: RoleRepresentation[];
    remove: RoleRepresentation[];
  }> = [];

  for (const [tokenClientId, tokenClient] of tokenClients) {
    for (const sourceClientId of Object.keys(CLIENT_ROLES) as ClientId[]) {
      const sourceClient = clients.get(sourceClientId);
      if (!sourceClient) {
        throw new Error(`Client ${sourceClientId} was not loaded`);
      }
      const mappingsUrl = clientRoleMappingsUrl(tokenClient, sourceClient);
      const currentRoles = await requestJson<RoleRepresentation[]>(mappingsUrl, {
        headers,
      });
      const desiredRoleNames =
        tokenClientId === sourceClientId ? CLIENT_ROLES[sourceClientId] : [];
      const planned = planManagedRoleScopeChanges(
        currentRoles,
        desiredRoleNames,
        MANAGED_CLIENT_ROLE_NAMES[sourceClientId],
      );
      const add = planned.add.map((name) => {
        const role = roles.get(roleKey(sourceClientId, name));
        if (!role) {
          throw new Error(
            `Role ${name} was not loaded for client ${sourceClientId}`,
          );
        }
        return role;
      });
      changes.push({
        mappingsUrl,
        tokenClientId,
        sourceClientId,
        add,
        remove: planned.remove,
      });
    }
  }

  for (const change of changes) {
    if (change.add.length > 0 || change.remove.length > 0) {
      console.log(
        `[keycloak] scope plan ${change.tokenClientId} <- ${change.sourceClientId}: add [${change.add.map(({ name }) => name).join(", ")}], remove [${change.remove.map(({ name }) => name).join(", ")}]`,
      );
    }
  }

  for (const { mappingsUrl, add, remove } of changes) {
    if (add.length > 0) {
      await requestJson(mappingsUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(add),
      });
    }
    if (remove.length > 0) {
      await requestJson(mappingsUrl, {
        method: "DELETE",
        headers,
        body: JSON.stringify(remove),
      });
    }
  }
}

function clientRoleMappingsUrl(
  client: ClientRepresentation,
  roleOwner: ClientRepresentation,
) {
  return `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/clients/${encodeURIComponent(client.id)}/scope-mappings/clients/${encodeURIComponent(roleOwner.id)}`;
}

async function removeStaleManagedClientRoles(
  clients: Map<ClientId, ClientRepresentation>,
  headers: Record<string, string>,
) {
  const removals: Array<{ clientId: ClientId; roleName: string; url: string }> =
    [];
  for (const clientId of Object.keys(CLIENT_ROLES) as ClientId[]) {
    const client = clients.get(clientId);
    if (!client) {
      throw new Error(`Client ${clientId} was not loaded`);
    }
    const desiredRoleNames = new Set<string>(CLIENT_ROLES[clientId]);
    for (const roleName of MANAGED_CLIENT_ROLE_NAMES[clientId]) {
      if (desiredRoleNames.has(roleName)) {
        continue;
      }
      const url = `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/clients/${encodeURIComponent(client.id)}/roles/${encodeURIComponent(roleName)}`;
      if (await getOptional<RoleRepresentation>(url, headers)) {
        removals.push({ clientId, roleName, url });
      }
    }
  }

  if (removals.length > 0) {
    console.log(
      `[keycloak] stale managed role deletion plan: ${removals.map(({ clientId, roleName }) => `${clientId}:${roleName}`).join(", ")}`,
    );
  }
  for (const { url } of removals) {
    await requestJson(url, { method: "DELETE", headers });
  }
}

async function removeRetiredRealmRoles(headers: Record<string, string>) {
  const removals: Array<{ name: string; url: string }> = [];
  for (const name of RETIRED_REALM_ROLE_NAMES) {
    const url = `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/roles/${encodeURIComponent(name)}`;
    if (await getOptional<RoleRepresentation>(url, headers)) {
      removals.push({ name, url });
    }
  }

  if (removals.length > 0) {
    console.log(
      `[keycloak] retired realm role deletion plan: ${removals.map(({ name }) => name).join(", ")}`,
    );
  }
  for (const { url } of removals) {
    await requestJson(url, { method: "DELETE", headers });
  }
}

async function ensureGroupPath(
  groupPath: string,
  headers: Record<string, string>,
) {
  const segments = groupPath.split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new Error(`Invalid empty Keycloak group path: ${groupPath}`);
  }

  let parent: GroupRepresentation | undefined;
  for (const name of segments) {
    const childrenUrl = parent
      ? `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/groups/${encodeURIComponent(parent.id)}/children?max=200`
      : `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/groups?max=200`;
    const children = await requestJson<GroupRepresentation[]>(childrenUrl, {
      headers,
    });
    const existing = children.find((group) => group.name === name);
    if (existing) {
      parent = existing;
      continue;
    }

    const createUrl = parent
      ? `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/groups/${encodeURIComponent(parent.id)}/children`
      : `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/groups`;
    await requestJson(createUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ name }),
    });

    const createdChildren = await requestJson<GroupRepresentation[]>(
      childrenUrl,
      { headers },
    );
    parent = createdChildren.find((group) => group.name === name);
    if (!parent) {
      throw new Error(`Group ${groupPath} was not returned after creation`);
    }
  }

  return parent;
}

async function removeRetiredGroups(headers: Record<string, string>) {
  const groups = await listAllGroups(headers);
  const retiredNames = new Set(RETIRED_GROUP_NAMES);
  for (const group of groups) {
    if (!retiredNames.has(group.name)) {
      continue;
    }
    await requestJson(
      `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/groups/${encodeURIComponent(group.id)}`,
      { method: "DELETE", headers },
    );
    console.log(`[keycloak] retired group '${group.name}' removed`);
  }
}

async function listAllGroups(headers: Record<string, string>) {
  const roots = await requestJson<GroupRepresentation[]>(
    `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/groups?max=200`,
    { headers },
  );
  const result: GroupRepresentation[] = [];
  const visit = async (group: GroupRepresentation) => {
    result.push(group);
    const children = await requestJson<GroupRepresentation[]>(
      `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/groups/${encodeURIComponent(group.id)}/children?max=200`,
      { headers },
    );
    for (const child of children) {
      await visit(child);
    }
  };
  for (const root of roots) {
    await visit(root);
  }
  return result;
}

async function reconcileGroupClientRoles(
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

  const planned = planManagedRoleScopeChanges(
    currentRoles,
    roles.map(({ name }) => name),
    MANAGED_CLIENT_ROLE_NAMES[client.clientId],
  );
  const desiredByName = new Map(roles.map((role) => [role.name, role]));
  const additions = planned.add.map((name) => desiredByName.get(name)!);

  if (additions.length > 0) {
    await requestJson(
      mappingsUrl,
      {
        method: "POST",
        headers,
        body: JSON.stringify(additions),
      },
    );
  }
  if (planned.remove.length > 0) {
    await requestJson(
      mappingsUrl,
      {
        method: "DELETE",
        headers,
        body: JSON.stringify(planned.remove),
      },
    );
  }
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

    return { user: created, created: true };
  }

  if (
    existing.username !== payload.username ||
    existing.email !== payload.email ||
    existing.enabled !== payload.enabled ||
    existing.emailVerified !== payload.emailVerified
  ) {
    await requestJson(
      `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(existing.id)}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      },
    );
  }

  return { user: existing, created: false };
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

async function reconcileUserGroups(
  userId: string,
  desiredGroups: readonly GroupRepresentation[],
  managedGroups: ReadonlyMap<string, GroupRepresentation>,
  headers: Record<string, string>,
) {
  const currentGroups = await requestJson<GroupRepresentation[]>(
    `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}/groups?briefRepresentation=true&max=200`,
    { headers },
  );
  const planned = planManagedIdChanges(
    currentGroups,
    desiredGroups,
    [...managedGroups.values()],
  );
  const desiredById = new Map(desiredGroups.map((group) => [group.id, group]));
  for (const id of planned.add) {
    const group = desiredById.get(id);
    if (!group) {
      throw new Error(`Desired group ${id} was not loaded`);
    }

    await requestJson(
      `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}/groups/${encodeURIComponent(group.id)}`,
      {
        method: "PUT",
        headers,
      },
    );
  }
  for (const group of planned.remove) {
    await requestJson(
      `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}/groups/${encodeURIComponent(group.id)}`,
      {
        method: "DELETE",
        headers,
      },
    );
  }
}

async function removeDirectManagedClientRoles(
  userId: string,
  clients: ReadonlyMap<ClientId, ClientRepresentation>,
  headers: Record<string, string>,
) {
  for (const clientId of Object.keys(CLIENT_ROLES) as ClientId[]) {
    const client = clients.get(clientId);
    if (!client) {
      throw new Error(`Client ${clientId} was not loaded`);
    }
    const mappingsUrl = `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}/role-mappings/clients/${encodeURIComponent(client.id)}`;
    const currentRoles = await requestJson<RoleRepresentation[]>(
      mappingsUrl,
      { headers },
    );
    const managed = new Set(MANAGED_CLIENT_ROLE_NAMES[clientId]);
    const directManagedRoles = currentRoles.filter(({ name }) =>
      managed.has(name),
    );
    if (directManagedRoles.length === 0) {
      continue;
    }
    await requestJson(mappingsUrl, {
      method: "DELETE",
      headers,
      body: JSON.stringify(directManagedRoles),
    });
    console.log(
      `[keycloak] removed direct managed roles from ${userId}: ${directManagedRoles.map(({ name }) => `${clientId}:${name}`).join(", ")}`,
    );
  }
}

async function removeDirectManagedClientRolesFromUsers(
  clients: ReadonlyMap<ClientId, ClientRepresentation>,
  headers: Record<string, string>,
) {
  const users = await requestJson<UserRepresentation[]>(
    `${keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm)}/users?max=200`,
    { headers },
  );
  for (const user of users) {
    await removeDirectManagedClientRoles(user.id, clients, headers);
  }
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