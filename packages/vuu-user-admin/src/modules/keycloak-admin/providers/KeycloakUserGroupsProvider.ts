import { Provider, type TableContainer } from "@heswell/vuu-server";
import type { KeycloakAdminSnapshot } from "../KeycloakAdminClient";
import { getKeycloakAdminSnapshot } from "../KeycloakAdminSnapshotStore";
import { reconcileTableRows } from "./reconcileTableRows";

export class KeycloakUserGroupsProvider extends Provider {
  async load(_: TableContainer) {
    this.loadSnapshot(await getKeycloakAdminSnapshot());
  }

  loadSnapshot(snapshot: KeycloakAdminSnapshot) {
    const rows = snapshot.userGroups.map(({ user, group }) => [
      `${user.id}:${group.id}`,
      user.id,
      user.username,
      group.id,
      group.name,
      group.path ?? "",
      snapshot.timestamp,
      snapshot.timestamp,
      "",
    ]);
    reconcileTableRows(this.table, rows);
    this.loaded = true;
  }
}
