import { Provider, type TableContainer } from "@heswell/vuu-server";
import {
  getGroupDisplayName,
  type UserAdminSnapshot,
} from "@heswell/user-admin";
import { getUserAdminSnapshot } from "../UserAdminSnapshotStore";
import { reconcileTableRows } from "./reconcileTableRows";
import { groupRoleCount, groupUserCount, leafGroups } from "./snapshotCounts";

export class UserAdminGroupsProvider extends Provider {
  async load(_: TableContainer) {
    this.loadSnapshot(await getUserAdminSnapshot());
  }

  loadSnapshot(snapshot: UserAdminSnapshot) {
    const rows = leafGroups(snapshot).map((group) => [
      group.id,
      getGroupDisplayName(group),
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
