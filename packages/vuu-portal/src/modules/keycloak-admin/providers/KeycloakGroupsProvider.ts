import { Provider, type TableContainer } from "@heswell/vuu-server";
import { KeycloakAdminClient } from "../KeycloakAdminClient";

export class KeycloakGroupsProvider extends Provider {
  async load(_: TableContainer) {
    const client = await KeycloakAdminClient.createFromEnv();
    const groups = await client.listSeedGroups();

    for (const group of groups) {
      const roleNames = await client.listRoleNamesForGroup(group.id);
      this.table.upsert([
        group.id,
        group.name,
        group.path ?? "",
        roleNames.join(","),
      ]);
    }

    this.loaded = true;
  }
}
