import type {
  KeycloakAdminSnapshot,
  KeycloakRole,
} from "../KeycloakAdminClient";

export const keycloakTimestamp = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
    const date = Date.parse(value);
    if (Number.isFinite(date)) return date;
  }
  return 0;
};

export const lastLogin = (user: { attributes?: Record<string, string | string[]> }) =>
  keycloakTimestamp(user.attributes?.last_login);

export const userGroupCount = (snapshot: KeycloakAdminSnapshot, userId: string) =>
  snapshot.userGroups.filter(({ user }) => user.id === userId).length;

export const userRoleCount = (snapshot: KeycloakAdminSnapshot, userId: string) => {
  const groupIds = new Set(
    snapshot.userGroups
      .filter(({ user }) => user.id === userId)
      .map(({ group }) => group.id),
  );
  return snapshot.groupRoles.filter(
    ({ group, client }) => client && groupIds.has(group.id),
  ).length;
};

export const groupUserCount = (snapshot: KeycloakAdminSnapshot, groupId: string) =>
  snapshot.userGroups.filter(({ group }) => group.id === groupId).length;

export const groupRoleCount = (snapshot: KeycloakAdminSnapshot, groupId: string) =>
  snapshot.groupRoles.filter(({ group, client }) => client && group.id === groupId).length;

export const roleCounts = (
  snapshot: KeycloakAdminSnapshot,
  role: KeycloakRole,
  clientId?: string,
) => {
  const assignments = snapshot.groupRoles.filter(
    ({ role: candidate, client }) =>
      client &&
      candidate.id === role.id &&
      client.id === clientId,
  );
  const groupIds = new Set(assignments.map(({ group }) => group.id));
  return {
    groupCount: groupIds.size,
    userCount: snapshot.userGroups.filter(({ group }) => groupIds.has(group.id)).length,
  };
};
