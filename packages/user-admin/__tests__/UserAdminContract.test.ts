import { describe, expect, test } from "bun:test";
import {
  USER_ADMIN_RPC_CONTRACT,
  USER_ADMIN_TABLE_SCHEMAS,
} from "../src/contracts";

describe("user admin browser contract", () => {
  test("defines VuuModule-ready schemas for every user admin table", () => {
    expect(Object.keys(USER_ADMIN_TABLE_SCHEMAS).sort()).toEqual([
      "clients",
      "group_roles",
      "groups",
      "roles",
      "user_group_roles",
      "user_groups",
      "users",
    ]);
    expect(USER_ADMIN_TABLE_SCHEMAS.users).toMatchObject({
      key: "user_id",
      table: { module: "USER_ADMIN", table: "users" },
    });
    expect(USER_ADMIN_TABLE_SCHEMAS.users.columns).toContainEqual({
      name: "vuuUpdatedTimestamp",
      serverDataType: "epochtimestamp",
    });
    for (const schema of Object.values(USER_ADMIN_TABLE_SCHEMAS)) {
      expect(schema.columns.every(({ serverDataType }) => serverDataType !== undefined)).toBe(
        true,
      );
    }
    expect(USER_ADMIN_RPC_CONTRACT.setUserModuleAccess).toEqual([
      "userId",
      "assignments",
    ]);
  });
});
