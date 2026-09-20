import {
  VUU_PORTAL_CLIENT_IDENTIFIER,
  type UserModuleAccessAssignment,
  type UserModuleAccessOptions,
} from "../contracts/UserAdminContract";
import type {
  UserAdminClient,
  UserAdminGroup,
  UserAdminOperations,
  UserAdminRole,
  UserAdminSnapshot,
  UserAdminUser,
} from "../contracts/UserAdminTypes";

export class InMemoryUserAdminStore implements UserAdminOperations {
  #nextId = 0;
  #snapshot: UserAdminSnapshot;

  constructor(initial: Partial<UserAdminSnapshot> = {}) {
    this.#snapshot = {
      users: initial.users ?? [],
      groups: initial.groups ?? [],
      clients: initial.clients ?? [],
      clientRoles: initial.clientRoles ?? [],
      userGroups: initial.userGroups ?? [],
      groupRoles: initial.groupRoles ?? [],
      timestamp: initial.timestamp ?? Date.now(),
    };
  }

  snapshot = async () => this.#snapshot;

  async addUser(user: Omit<UserAdminUser, "id"> & { temporary_password?: string }) {
    this.#snapshot.users.push({ ...user, id: this.id("user") });
    this.touch();
  }

  async updateUser({ userId, temporary_password: _password, ...changes }: {
    userId: string;
    temporary_password?: string;
  } & Partial<Omit<UserAdminUser, "id" | "attributes" | "requiredActions">>) {
    Object.assign(this.user(userId), changes);
    this.touch();
  }

  async deleteUser(userId: string) {
    this.#snapshot.users = this.#snapshot.users.filter(({ id }) => id !== userId);
    this.#snapshot.userGroups = this.#snapshot.userGroups.filter(
      ({ user }) => user.id !== userId,
    );
    this.touch();
  }

  async findUserByUsername(username: string) {
    return this.#snapshot.users.find((user) => user.username === username);
  }

  async syncUserGroups(userId: string, groupIds: string[]) {
    const user = this.user(userId);
    const groups = groupIds.map((groupId) => this.group(groupId));
    this.#snapshot.userGroups = this.#snapshot.userGroups.filter(
      ({ user: candidate }) => candidate.id !== user.id,
    );
    this.#snapshot.userGroups.push(...groups.map((group) => ({ user, group })));
    this.touch();
  }

  async addGroup({ name }: { name: string }) {
    const id = this.id("group");
    this.#snapshot.groups.push({ id, name, path: `/${name}` });
    this.touch();
  }

  async updateGroup(groupId: string, { name }: { name: string }) {
    const group = this.group(groupId);
    group.name = name;
    this.touch();
  }

  async deleteGroup(groupId: string) {
    this.#snapshot.groups = this.#snapshot.groups.filter(({ id }) => id !== groupId);
    this.#snapshot.userGroups = this.#snapshot.userGroups.filter(
      ({ group }) => group.id !== groupId,
    );
    this.#snapshot.groupRoles = this.#snapshot.groupRoles.filter(
      ({ group }) => group.id !== groupId,
    );
    this.touch();
  }

  async addClient(client: Omit<UserAdminClient, "id">) {
    this.#snapshot.clients.push({ ...client, id: this.id("client") });
    this.touch();
  }

  async updateClient(clientId: string, changes: Partial<UserAdminClient>) {
    Object.assign(this.clientByIdentifier(clientId), changes);
    this.touch();
  }

  async addRole({ name, description = "" }: { name: string; description?: string }) {
    this.#snapshot.clientRoles.push({
      client: { id: "realm", clientId: "realm" },
      role: { id: this.id("role"), name, description },
    });
    this.touch();
  }

  async addClientRole(
    { clientKey }: { clientKey: string },
    { name, description = "" }: { name: string; description?: string },
  ) {
    const client = this.clientByIdentifier(clientKey);
    this.#snapshot.clientRoles.push({
      client,
      role: { id: this.id("role"), name, description, clientRole: true, containerId: client.id },
    });
    this.touch();
  }

  async updateRealmRole(roleId: string, changes: Partial<UserAdminRole>) {
    Object.assign(this.role(roleId), changes);
    this.touch();
  }

  async updateClientRole(
    clientId: string,
    roleName: string,
    changes: Partial<UserAdminRole>,
  ) {
    const client = this.clientByIdentifier(clientId);
    const role = this.#snapshot.clientRoles.find(
      ({ client: candidate, role }) => candidate.id === client.id && role.name === roleName,
    )?.role;
    if (!role) throw new Error(`User admin client role not found: ${roleName}`);
    Object.assign(role, changes);
    this.touch();
  }

  async addRoleToGroup(
    groupRef: { groupId?: string; groupName?: string },
    roleRef: { roleId?: string; roleName?: string },
    clientRef?: { clientKey: string },
  ) {
    const group = this.groupFor(groupRef);
    const { client, role } = this.roleFor(roleRef, clientRef);
    if (!this.#snapshot.groupRoles.some(
      (assignment) => assignment.group.id === group.id && assignment.role.id === role.id,
    )) {
      this.#snapshot.groupRoles.push({ group, role, client });
      this.touch();
    }
  }

  async removeRoleFromGroup(
    groupRef: { groupId?: string; groupName?: string },
    roleRef: { roleId?: string; roleName?: string },
    clientRef?: { clientKey: string },
  ) {
    const group = this.groupFor(groupRef);
    const { role } = this.roleFor(roleRef, clientRef);
    this.#snapshot.groupRoles = this.#snapshot.groupRoles.filter(
      (assignment) => assignment.group.id !== group.id || assignment.role.id !== role.id,
    );
    this.touch();
  }

  async addUserToGroup(
    userRef: { userId?: string; username?: string },
    groupRef: { groupId?: string; groupName?: string },
  ) {
    const user = userRef.userId ? this.user(userRef.userId) : this.userByName(userRef.username);
    const group = this.groupFor(groupRef);
    if (!this.#snapshot.userGroups.some(
      (membership) => membership.user.id === user.id && membership.group.id === group.id,
    )) {
      this.#snapshot.userGroups.push({ user, group });
      this.touch();
    }
  }

  async removeUserFromGroup(
    userRef: { userId?: string; username?: string },
    groupRef: { groupId?: string; groupName?: string },
  ) {
    const user = userRef.userId ? this.user(userRef.userId) : this.userByName(userRef.username);
    const group = this.groupFor(groupRef);
    this.#snapshot.userGroups = this.#snapshot.userGroups.filter(
      (membership) => membership.user.id !== user.id || membership.group.id !== group.id,
    );
    this.touch();
  }

  async getUserModuleAccessOptions(userId: string): Promise<UserModuleAccessOptions> {
    const userGroupIds = new Set(
      this.#snapshot.userGroups
        .filter(({ user }) => user.id === userId)
        .map(({ group }) => group.id),
    );
    const portal = this.#snapshot.clients.find(
      ({ clientId }) => clientId === VUU_PORTAL_CLIENT_IDENTIFIER,
    );
    if (!portal) return { modules: [] };

    const groupsById = new Map(this.#snapshot.groups.map((group) => [group.id, group]));
    return {
      modules: this.#snapshot.clientRoles
        .filter(({ client, role }) => client.id === portal.id && role.name.endsWith("-access"))
        .sort((left, right) => left.role.name.localeCompare(right.role.name))
        .map(({ role }) => {
          const groups = this.#snapshot.groupRoles
            .filter(({ client, role: candidate }) => client?.id === portal.id && candidate.id === role.id)
            .map(({ group }) => groupsById.get(group.id) ?? group)
            .filter((group, index, allGroups) =>
              allGroups.findIndex(({ id }) => id === group.id) === index,
            )
            .sort((left, right) => left.id.localeCompare(right.id));
          const defaultGroups = groups.filter(({ moduleAccessDefaultRoles }) =>
            moduleAccessDefaultRoles?.includes(role.name),
          );
          if (defaultGroups.length !== 1) {
            throw new Error(
              `Invalid default-group configuration for module access role "${role.name}": ` +
              `expected exactly one eligible default group, found ${defaultGroups.length}`,
            );
          }
          const defaultGroupId = defaultGroups[0].id;
          const selectedGroupIds = groups
            .filter(({ id }) => userGroupIds.has(id))
            .map(({ id }) => id);
          return {
            clientIdentifier: portal.clientId,
            loginRole: role.name,
            groups: groups.map((group) => ({
              groupId: group.id,
              groupName: group.name,
              groupPath: group.path,
              roleId: role.id,
              roleName: role.name,
              isDefault: group.id === defaultGroupId,
            })),
            selectedGroupIds,
            ...(selectedGroupIds[0] ? { selectedGroupId: selectedGroupIds[0] } : {}),
          };
        }),
    };
  }

  async setUserModuleAccess(userId: string, assignments: readonly UserModuleAccessAssignment[]) {
    const options = await this.getUserModuleAccessOptions(userId);
    const groupsByRole = new Map(options.modules.map((module) => [
      module.loginRole,
      new Set(module.groups.map(({ groupId }) => groupId)),
    ]));
    const requestedGroupIds = new Set<string>();
    const assignmentsByKey = new Set<string>();
    for (const { loginRole, groupId } of assignments) {
      const assignmentKey = `${loginRole}\u0000${groupId}`;
      if (assignmentsByKey.has(assignmentKey)) {
        throw new Error(`Duplicate module access assignment: ${loginRole} -> ${groupId}`);
      }
      assignmentsByKey.add(assignmentKey);
      if (!groupsByRole.get(loginRole)?.has(groupId)) {
        throw new Error(`Invalid module access assignment: ${loginRole} -> ${groupId}`);
      }
      requestedGroupIds.add(groupId);
    }
    const managedGroupIds = new Set(
      options.modules.flatMap((module) => module.groups.map(({ groupId }) => groupId)),
    );
    const current = this.#snapshot.userGroups
      .filter(({ user }) => user.id === userId)
      .map(({ group }) => group.id);
    await this.syncUserGroups(userId, [
      ...current.filter((groupId) => !managedGroupIds.has(groupId)),
      ...[...requestedGroupIds].sort((left, right) => left.localeCompare(right)),
    ]);
  }

  private id(prefix: string) {
    this.#nextId += 1;
    return `${prefix}-${this.#nextId}`;
  }

  private touch() {
    this.#snapshot.timestamp = Date.now();
  }

  private user(id: string) {
    return this.find(this.#snapshot.users, id, "user");
  }

  private userByName(username?: string) {
    const user = this.#snapshot.users.find((candidate) => candidate.username === username);
    if (!user) throw new Error(`User admin user not found: ${username}`);
    return user;
  }

  private group(id: string) {
    return this.find(this.#snapshot.groups, id, "group");
  }

  private groupFor({ groupId, groupName }: { groupId?: string; groupName?: string }) {
    if (groupId) return this.group(groupId);
    const group = this.#snapshot.groups.find(({ name }) => name === groupName);
    if (!group) throw new Error(`User admin group not found: ${groupName}`);
    return group;
  }

  private clientByIdentifier(clientId: string) {
    const client = this.#snapshot.clients.find((candidate) => candidate.clientId === clientId);
    if (!client) throw new Error(`User admin client not found: ${clientId}`);
    return client;
  }

  private role(roleId: string) {
    const role = this.#snapshot.clientRoles.find(
      ({ role: candidate }) => candidate.id === roleId,
    )?.role;
    if (!role) throw new Error(`User admin role not found: ${roleId}`);
    return role;
  }

  private roleFor(
    { roleId, roleName }: { roleId?: string; roleName?: string },
    clientRef?: { clientKey: string },
  ) {
    const client = clientRef ? this.clientByIdentifier(clientRef.clientKey) : undefined;
    const assignment = this.#snapshot.clientRoles.find(
      ({ client: candidate, role }) =>
        (!client || candidate.id === client.id) &&
        (role.id === roleId || (roleName !== undefined && role.name === roleName)),
    );
    if (!assignment) throw new Error(`User admin role not found: ${roleId ?? roleName}`);
    return { client, role: assignment.role };
  }

  private find<T extends { id: string }>(items: T[], id: string, type: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) throw new Error(`User admin ${type} not found: ${id}`);
    return item;
  }
}
