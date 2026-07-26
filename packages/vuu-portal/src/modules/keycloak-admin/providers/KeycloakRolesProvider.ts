import { Provider, type TableContainer } from "@heswell/vuu-server";
import { KeycloakAdminClient } from "../KeycloakAdminClient";

export class KeycloakRolesProvider extends Provider {
  async load(_: TableContainer) {
    const client = await KeycloakAdminClient.createFromConfig();
    const roles = await client.listSeedRoles();

    for (const role of roles) {
      const timestamp = Date.now();
      this.table.upsert([
        role.id,
        role.name,
        role.description ?? "",
        timestamp,
        timestamp,
        "",
      ]);
    }

    this.loaded = true;
  }
}
