import { Provider, type TableContainer } from "@heswell/vuu-server";
import type { UserAdminSnapshot } from "../../../contracts/UserAdminTypes";
import { getUserAdminSnapshot } from "../UserAdminSnapshotStore";
import { reconcileTableRows } from "./reconcileTableRows";

export class UserAdminUserGroupsProvider extends Provider {
  async load(_: TableContainer) {
    this.loadSnapshot(await getUserAdminSnapshot());
  }

  loadSnapshot(snapshot: UserAdminSnapshot) {
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
