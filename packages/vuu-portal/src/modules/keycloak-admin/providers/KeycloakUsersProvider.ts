import { Provider, type TableContainer } from "@heswell/vuu-server";
import { KeycloakAdminClient } from "../KeycloakAdminClient";
import { reconcileTableRows } from "./reconcileTableRows";

export class KeycloakUsersProvider extends Provider {
  async load(_: TableContainer) {
    const client = await KeycloakAdminClient.createFromConfig();
    const users = await client.listSeedUsers();
    const rows = users.map((user) => {
      const timestamp = Date.now();
      return [
        user.id,
        user.username,
        user.email ?? "",
        `${user.enabled ?? false}`,
        timestamp,
        timestamp,
        "",
      ];
    });

    reconcileTableRows(this.table, rows);

    this.loaded = true;
  }
}
