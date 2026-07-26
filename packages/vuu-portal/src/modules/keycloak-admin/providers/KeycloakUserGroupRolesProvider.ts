import { Provider, type TableContainer } from "@heswell/vuu-server";
import { KeycloakAdminClient } from "../KeycloakAdminClient";
import { reconcileTableRows } from "./reconcileTableRows";

export class KeycloakUserGroupRolesProvider extends Provider {
  async load(_: TableContainer) {
    const client = await KeycloakAdminClient.createFromConfig();
    const [users, groups, roles] = await Promise.all([
      client.listSeedUsers(),
      client.listSeedGroups(),
      client.listSeedRoles(),
    ]);
    const seededGroupIds = new Set(groups.map((group) => group.id));
    const seededRoleIds = new Set(roles.map((role) => role.id));

    const rows: (string | number)[][] = [];

    for (const user of users) {
      const userGroups = await client.listGroupsForUser(user.id);
      const seededUserGroups = userGroups.filter((group) => seededGroupIds.has(group.id));

      for (const group of seededUserGroups) {
        const groupRoles = await client.listRolesForGroup(group.id);
        const seededGroupRoles = groupRoles.filter((role) => seededRoleIds.has(role.id));

        for (const role of seededGroupRoles) {
          const id = `${user.id}:${group.id}:${role.id}`;
          const timestamp = Date.now();
          rows.push([
            id,
            user.username,
            user.email ?? "",
            `${user.enabled ?? false}`,
            group.id,
            group.name,
            role.id,
            role.name,
            timestamp,
            timestamp,
            "",
          ]);
        }
      }
    }
    reconcileTableRows(this.table, rows);

    this.loaded = true;
  }
}
