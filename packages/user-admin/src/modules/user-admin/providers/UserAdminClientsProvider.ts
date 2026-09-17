import { Provider, type TableContainer } from "@heswell/vuu-server";
import type { UserAdminSnapshot } from "../../../contracts/UserAdminTypes";
import { getUserAdminSnapshot } from "../UserAdminSnapshotStore";
import { reconcileTableRows } from "./reconcileTableRows";

export class UserAdminClientsProvider extends Provider {
  async load(_: TableContainer) {
    this.loadSnapshot(await getUserAdminSnapshot());
  }

  loadSnapshot(snapshot: UserAdminSnapshot) {
    const rows = snapshot.clients.map((client) => [
      client.id,
      client.clientId,
      client.name ?? client.clientId,
      client.description ?? "",
      client.enabled ?? true,
      snapshot.timestamp,
      snapshot.timestamp,
      "",
    ]);
    reconcileTableRows(this.table, rows);
    this.loaded = true;
  }
}
