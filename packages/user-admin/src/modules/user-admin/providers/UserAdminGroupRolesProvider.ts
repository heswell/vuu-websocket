import { Provider, type TableContainer } from "@heswell/vuu-server";
import type { UserAdminSnapshot } from "../../../contracts/UserAdminTypes";
import { getUserAdminSnapshot } from "../UserAdminSnapshotStore";
import { reconcileTableRows } from "./reconcileTableRows";

export class UserAdminGroupRolesProvider extends Provider {
  async load(_: TableContainer) {
    this.loadSnapshot(await getUserAdminSnapshot());
  }

  loadSnapshot(snapshot: UserAdminSnapshot) {
    const rows = snapshot.groupRoles
      .filter(({ client }) => client)
      .map(({ group, role, client }) => [
        `${group.id}:${client?.id ?? "realm"}:${role.id}`,
        group.id,
        group.name,
        role.id,
        role.name,
        client?.id ?? "",
        client?.clientId ?? "",
        client?.name ?? client?.clientId ?? "",
        snapshot.timestamp,
        snapshot.timestamp,
        "",
      ]);
    reconcileTableRows(this.table, rows);
    this.loaded = true;
  }
}
