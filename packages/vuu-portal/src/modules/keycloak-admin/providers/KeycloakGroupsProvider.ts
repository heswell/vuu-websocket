import { Provider, type TableContainer } from "@heswell/vuu-server";
import { KeycloakAdminClient } from "../KeycloakAdminClient";
import { reconcileTableRows } from "./reconcileTableRows";

export class KeycloakGroupsProvider extends Provider {
  async load(_: TableContainer) {
    const client = await KeycloakAdminClient.createFromConfig();
    const groups = await client.listSeedGroups();
    const rows = await Promise.all(
      groups.map(async (group) => {
        const roleNames = await client.listRoleNamesForGroup(group.id);
        const timestamp = Date.now();
        return [
          group.id,
          group.name,
          group.path ?? "",
          roleNames.join(","),
          timestamp,
          timestamp,
          "",
        ];
      }),
    );

    reconcileTableRows(this.table, rows);

    this.loaded = true;
  }
}
