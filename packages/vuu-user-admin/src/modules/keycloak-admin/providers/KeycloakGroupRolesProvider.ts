import { Provider, type TableContainer } from "@heswell/vuu-server";
import { KeycloakAdminClient } from "../KeycloakAdminClient";
import { reconcileTableRows } from "./reconcileTableRows";

export class KeycloakGroupRolesProvider extends Provider {
  async load(_: TableContainer) {
    const client = await KeycloakAdminClient.createFromConfig();
    const [groups, roles] = await Promise.all([
      client.listSeedGroups(),
      client.listSeedRoles(),
    ]);
    const seededRoleIds = new Set(roles.map((role) => role.id));

    const rows: (string | number)[][] = [];

    for (const group of groups) {
      const groupRoles = await client.listRolesForGroup(group.id);
      const seededGroupRoles = groupRoles.filter((role) => seededRoleIds.has(role.id));

      for (const role of seededGroupRoles) {
        const id = `${group.id}:${role.id}`;
        const timestamp = Date.now();
        rows.push([
          id,
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

    reconcileTableRows(this.table, rows);

    this.loaded = true;
  }
}
