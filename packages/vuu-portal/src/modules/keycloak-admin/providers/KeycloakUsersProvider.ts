import { Provider, type TableContainer } from "@heswell/vuu-server";
import { KeycloakAdminClient } from "../KeycloakAdminClient";

export class KeycloakUsersProvider extends Provider {
  async load(_: TableContainer) {
    const client = await KeycloakAdminClient.createFromEnv();
    const users = await client.listSeedUsers();

    for (const user of users) {
      const groupNames = await client.listGroupNamesForUser(user.id);
      this.table.upsert([
        user.id,
        user.username,
        user.email ?? "",
        `${user.enabled ?? false}`,
        groupNames.join(","),
      ]);
    }

    this.loaded = true;
  }
}
