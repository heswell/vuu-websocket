import { Provider, type TableContainer } from "@heswell/vuu-server";
import { KeycloakAdminClient } from "../KeycloakAdminClient";

export class KeycloakUsersProvider extends Provider {
  async load(_: TableContainer) {
    const client = await KeycloakAdminClient.createFromConfig();
    const users = await client.listSeedUsers();

    for (const user of users) {
      const timestamp = Date.now();
      this.table.upsert([
        user.id,
        user.username,
        user.email ?? "",
        `${user.enabled ?? false}`,
        timestamp,
        timestamp,
        "",
      ]);
    }

    this.loaded = true;
  }
}
