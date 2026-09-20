import { describe, expect, test } from "bun:test";
import {
  InMemoryUserAdminStore,
  createUserAdminModuleAccessFixture,
} from "../src";
import {
  normalizeUserModuleAccessPermissions,
  serializeUserModuleAccessPermissions,
  type UserAdminGroup,
  type UserAdminSnapshot,
} from "../src/contracts";

const user = { id: "u1", username: "alice" };

function fixtureSnapshot(
  changes: Partial<UserAdminSnapshot> = {},
): UserAdminSnapshot {
  const fixture = createUserAdminModuleAccessFixture();
  return {
    users: [user],
    groups: fixture.groups ?? [],
    clients: fixture.clients ?? [],
    clientRoles: fixture.clientRoles ?? [],
    userGroups: [],
    groupRoles: fixture.groupRoles ?? [],
    timestamp: 1,
    ...changes,
  };
}

function group(snapshot: UserAdminSnapshot, id: string) {
  const result = snapshot.groups.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Missing test group ${id}`);
  return result;
}

describe("InMemoryUserAdminStore", () => {
  test("returns all selected groups and exactly one explicit default per role", async () => {
    const snapshot = fixtureSnapshot();
    const store = new InMemoryUserAdminStore({
      ...snapshot,
      userGroups: [
        { user, group: group(snapshot, "group-user-admin-read") },
        { user, group: group(snapshot, "group-user-admin-admin") },
      ],
    });

    const options = await store.getUserModuleAccessOptions(user.id);
    const userAdmin = options.modules.find(
      ({ accessRole }) => accessRole === "user-admin-access",
    );

    expect(userAdmin?.selectedGroupIds).toEqual([
      "group-user-admin-admin",
      "group-user-admin-read",
    ]);
    expect(userAdmin?.selectedGroupId).toBe("group-user-admin-admin");
    expect(userAdmin?.groups.filter(({ isDefault }) => isDefault).map(({ groupId }) => groupId))
      .toEqual(["group-user-admin-read"]);
    expect([
      ["group-user-admin-read", "read"],
      ["group-user-admin-admin", "read"],
      ["group-module-admin-read", "module-admin-read"],
      ["group-module-admin-admin", "module-admin-read"],
      ["group-basket-trading-read", "read"],
      ["group-basket-trading-trade", "read"],
    ].every(([groupId, roleName]) =>
      snapshot.groupRoles.some(
        ({ group, role }) => group.id === groupId && role.name === roleName,
      ),
    )).toBe(true);
    expect(options.modules).toHaveLength(3);
  });

  test("fails clearly when a role has no eligible default group", async () => {
    const snapshot = fixtureSnapshot({
      groups: fixtureSnapshot().groups.map((candidate) =>
        candidate.id === "group-user-admin-read"
          ? { ...candidate, moduleAccessDefaultRoles: [] }
          : candidate
      ),
    });
    const store = new InMemoryUserAdminStore(snapshot);

    await expect(store.getUserModuleAccessOptions(user.id)).rejects.toThrow(
      'Invalid default-group configuration for module access role "user-admin-access": ' +
      "expected exactly one eligible default group, found 0",
    );
  });

  test("fails clearly when a role has multiple eligible default groups", async () => {
    const snapshot = fixtureSnapshot();
    const groups = snapshot.groups.map((candidate) =>
      candidate.id === "group-user-admin-admin"
        ? { ...candidate, moduleAccessDefaultRoles: ["user-admin-access"] }
        : candidate
    );
    const store = new InMemoryUserAdminStore({ ...snapshot, groups });

    await expect(store.getUserModuleAccessOptions(user.id)).rejects.toThrow(
      'Invalid default-group configuration for module access role "user-admin-access": ' +
      "expected exactly one eligible default group, found 2",
    );
  });

  test("persists the default group when an application is added", async () => {
    const snapshot = fixtureSnapshot();
    const store = new InMemoryUserAdminStore(snapshot);

    const options = await store.getUserModuleAccessOptions(user.id);
    const defaultGroup = options.modules[0].groups.find(({ isDefault }) => isDefault);
    if (!defaultGroup) throw new Error("Missing default group in test fixture");

    await store.setUserModuleAccess(user.id, [{
      accessRole: options.modules[0].accessRole,
      groupId: defaultGroup.groupId,
    }]);

    expect((await store.snapshot()).userGroups.map(({ group }) => group.id)).toEqual([
      defaultGroup.groupId,
    ]);
  });

  test("persists and reloads multiple groups, then removes only one selection", async () => {
    const snapshot = fixtureSnapshot();
    const store = new InMemoryUserAdminStore(snapshot);
    const assignments = [
      { accessRole: "user-admin-access", groupId: "group-user-admin-read" },
      { accessRole: "user-admin-access", groupId: "group-user-admin-admin" },
    ] as const;

    await store.setUserModuleAccess(user.id, assignments);
    expect((await store.getUserModuleAccessOptions(user.id)).modules.find(
      ({ accessRole }) => accessRole === "basket-trading-access",
    )?.selectedGroupIds).toEqual([]);
    expect((await store.getUserModuleAccessOptions(user.id)).modules.find(
      ({ accessRole }) => accessRole === "user-admin-access",
    )?.selectedGroupIds).toEqual([
      "group-user-admin-admin",
      "group-user-admin-read",
    ]);

    await store.setUserModuleAccess(user.id, [assignments[0]]);

    expect((await store.getUserModuleAccessOptions(user.id)).modules.find(
      ({ accessRole }) => accessRole === "user-admin-access",
    )?.selectedGroupIds).toEqual(["group-user-admin-read"]);
  });

  test("removes managed access without removing unrelated memberships", async () => {
    const snapshot = fixtureSnapshot();
    const unrelated: UserAdminGroup = {
      id: "realm-administrators",
      name: "realm administrators",
      path: "/realm-administrators",
    };
    const store = new InMemoryUserAdminStore({
      ...snapshot,
      groups: [...snapshot.groups, unrelated],
      userGroups: [{ user, group: unrelated }],
    });

    await store.setUserModuleAccess(user.id, [{
      accessRole: "basket-trading-access",
      groupId: "group-basket-trading-read",
    }]);
    await store.setUserModuleAccess(user.id, []);

    expect((await store.snapshot()).userGroups.map(({ group }) => group.id)).toEqual([
      unrelated.id,
    ]);
  });

  test("rejects duplicate or ineligible assignments", async () => {
    const store = new InMemoryUserAdminStore(fixtureSnapshot());

    await expect(store.setUserModuleAccess(user.id, [
      { accessRole: "user-admin-access", groupId: "group-user-admin-read" },
      { accessRole: "user-admin-access", groupId: "group-user-admin-read" },
    ])).rejects.toThrow(
      "Duplicate module access assignment: user-admin-access -> group-user-admin-read",
    );
    await expect(store.setUserModuleAccess(user.id, [
      { accessRole: "missing-access", groupId: "group-user-admin-read" },
    ])).rejects.toThrow(
      "Invalid module access assignment: missing-access -> group-user-admin-read",
    );
    await expect(store.setUserModuleAccess(user.id, [
      { accessRole: "user-admin-access", groupId: "group-module-admin-read" },
    ])).rejects.toThrow(
      "Invalid module access assignment: user-admin-access -> group-module-admin-read",
    );
  });

  test("validates all user edits before applying any user or membership change", async () => {
    const store = new InMemoryUserAdminStore(fixtureSnapshot());

    await expect(store.applyUserEdits!([{
      userId: user.id,
      changes: { username: "changed" },
      assignments: [{
        accessRole: "user-admin-access",
        groupId: "not-eligible",
      }],
    }])).rejects.toThrow(
      "Invalid module access assignment: user-admin-access -> not-eligible",
    );

    expect((await store.snapshot()).users[0]?.username).toBe("alice");
    expect((await store.snapshot()).userGroups).toEqual([]);
  });

  test("normalizes canonical permissions deterministically", () => {
    const permissions = normalizeUserModuleAccessPermissions([
      {
        clientIdentifier: "vuu-portal",
        accessRole: "module-admin-access",
        groupIds: ["module-admin", "module-read", "module-admin"],
      },
      {
        clientIdentifier: "vuu-portal",
        accessRole: "user-admin-access",
        groupIds: ["user-read"],
      },
      {
        clientIdentifier: "vuu-portal",
        accessRole: "module-admin-access",
        groupIds: ["module-read"],
      },
    ]);

    expect(permissions).toEqual([
      {
        clientIdentifier: "vuu-portal",
        accessRole: "module-admin-access",
        groupIds: ["module-admin", "module-read"],
      },
      {
        clientIdentifier: "vuu-portal",
        accessRole: "user-admin-access",
        groupIds: ["user-read"],
      },
    ]);
    expect(serializeUserModuleAccessPermissions(permissions)).toBe(
      '[{"clientIdentifier":"vuu-portal","accessRole":"module-admin-access",' +
      '"groupIds":["module-admin","module-read"]},{"clientIdentifier":"vuu-portal",' +
      '"accessRole":"user-admin-access","groupIds":["user-read"]}]',
    );
  });
});
