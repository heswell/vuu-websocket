import { describe, expect, test } from "bun:test";
import {
  InMemoryUserAdminStore,
  type UserAdminSnapshot,
} from "@heswell/user-admin";
import {
  createInMemoryUserAdminFeature,
  createUserAdminFeature,
} from "../src/modules/user-admin";

describe("UserAdminFeature", () => {
  const snapshot: UserAdminSnapshot = {
    users: [],
    groups: [],
    clients: [],
    clientRoles: [],
    userGroups: [],
    groupRoles: [],
    timestamp: 1,
  };

  test("creates an embeddable in-memory VUU feature", () => {
    expect(createInMemoryUserAdminFeature().module.name).toBe("USER_ADMIN");
  });

  test("uses the supplied refresh source when reconciling VUU tables", async () => {
    let refreshes = 0;
    const provider = { loadSnapshot: () => undefined };
    const feature = createUserAdminFeature({
      createOperations: async () => new InMemoryUserAdminStore(snapshot),
      refreshSnapshot: async () => {
        refreshes += 1;
        return snapshot;
      },
      snapshotSource: async () => snapshot,
    });

    await feature
      .install(
        {} as never,
        { getProviderForTable: () => provider } as never,
      )
      .refreshAll("test");

    expect(refreshes).toBe(1);
  });
});
