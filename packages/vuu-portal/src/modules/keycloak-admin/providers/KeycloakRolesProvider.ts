import { Provider, type TableContainer } from "@heswell/vuu-server";
import { KeycloakAdminClient } from "../KeycloakAdminClient";

export class KeycloakRolesProvider extends Provider {
  async load(_: TableContainer) {
    const client = await KeycloakAdminClient.createFromEnv();
    const roles = await client.listSeedRoles();

    for (const role of roles) {
      this.table.upsert([role.id, role.name, role.description ?? ""]);
    }

    this.loaded = true;
  }
}
