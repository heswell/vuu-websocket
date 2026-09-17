import { describe, expect, test } from "bun:test";
import {
  createInMemoryUserAdminFeature,
  InMemoryUserAdminStore,
} from "../src";

describe("InMemoryUserAdminStore", () => {
  test("updates local memberships while preserving unrelated groups", async () => {
    const store = new InMemoryUserAdminStore({
      users: [{ id: "u1", username: "alice" }],
      groups: [
        { id: "access", name: "orders-users", path: "/orders/users" },
        { id: "unrelated", name: "other", path: "/other" },
      ],
      clients: [{ id: "portal", clientId: "vuu-portal" }],
      clientRoles: [
        {
          client: { id: "portal", clientId: "vuu-portal" },
          role: { id: "orders-access", name: "orders-access" },
        },
      ],
      userGroups: [
        {
          user: { id: "u1", username: "alice" },
          group: { id: "unrelated", name: "other", path: "/other" },
        },
      ],
      groupRoles: [
        {
          group: { id: "access", name: "orders-users", path: "/orders/users" },
          client: { id: "portal", clientId: "vuu-portal" },
          role: { id: "orders-access", name: "orders-access" },
        },
      ],
    });

    await store.setUserModuleAccess("u1", [
      { loginRole: "orders-access", groupId: "access" },
    ]);

    expect((await store.snapshot()).userGroups.map(({ group }) => group.id).sort()).toEqual([
      "access",
      "unrelated",
    ]);

    await store.setUserModuleAccess("u1", []);

    expect((await store.snapshot()).userGroups.map(({ group }) => group.id)).toEqual([
      "unrelated",
    ]);
  });

  test("creates an embeddable in-memory VUU feature", () => {
    expect(createInMemoryUserAdminFeature().module.name).toBe("USER_ADMIN");
  });
});
