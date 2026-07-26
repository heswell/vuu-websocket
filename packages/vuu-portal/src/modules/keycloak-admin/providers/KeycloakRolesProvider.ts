import { Provider, type TableContainer } from "@heswell/vuu-server";
import { KeycloakAdminClient } from "../KeycloakAdminClient";
import { reconcileTableRows } from "./reconcileTableRows";

export class KeycloakRolesProvider extends Provider {
  async load(_: TableContainer) {
    const client = await KeycloakAdminClient.createFromConfig();
    const roles = await client.listSeedRoles();
    const rows = roles.map((role) => {
      const timestamp = Date.now();
      return [
        role.id,
        role.name,
        role.description ?? "",
        timestamp,
        timestamp,
        "",
      ];
    });

    reconcileTableRows(this.table, rows);

    this.loaded = true;
  }
}
