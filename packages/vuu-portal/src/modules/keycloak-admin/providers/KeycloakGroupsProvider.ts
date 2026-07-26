import { Provider, type TableContainer } from "@heswell/vuu-server";
import { KeycloakAdminClient } from "../KeycloakAdminClient";

export class KeycloakGroupsProvider extends Provider {
  async load(_: TableContainer) {
    const client = await KeycloakAdminClient.createFromConfig();
    const groups = await client.listSeedGroups();

    for (const group of groups) {
      const roleNames = await client.listRoleNamesForGroup(group.id);
      const timestamp = Date.now();
      this.table.upsert([
        group.id,
        group.name,
        group.path ?? "",
        roleNames.join(","),
        timestamp,
        timestamp,
        "",
      ]);
    }

    this.loaded = true;
  }
}
