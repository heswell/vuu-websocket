import { Provider, type TableContainer } from "@heswell/vuu-server";
import type { KeycloakAdminSnapshot } from "../KeycloakAdminClient";
import { getKeycloakAdminSnapshot } from "../KeycloakAdminSnapshotStore";
import { reconcileTableRows } from "./reconcileTableRows";
import { groupRoleCount, groupUserCount, leafGroups } from "./snapshotCounts";

export class KeycloakGroupsProvider extends Provider {
  async load(_: TableContainer) {
    this.loadSnapshot(await getKeycloakAdminSnapshot());
  }

  loadSnapshot(snapshot: KeycloakAdminSnapshot) {
    const rows = leafGroups(snapshot).map((group) => [
      group.id,
      group.path ?? "",
      group.parentId ?? "",
      groupUserCount(snapshot, group.id),
      groupRoleCount(snapshot, group.id),
      snapshot.timestamp,
      snapshot.timestamp,
      "",
    ]);
    reconcileTableRows(this.table, rows);
    this.loaded = true;
  }
}
