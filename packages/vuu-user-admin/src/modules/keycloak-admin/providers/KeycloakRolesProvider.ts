import { Provider, type TableContainer } from "@heswell/vuu-server";
import type { KeycloakAdminSnapshot } from "../KeycloakAdminClient";
import { getKeycloakAdminSnapshot } from "../KeycloakAdminSnapshotStore";
import { reconcileTableRows } from "./reconcileTableRows";
import { roleCounts } from "./snapshotCounts";

export class KeycloakRolesProvider extends Provider {
  async load(_: TableContainer) {
    this.loadSnapshot(await getKeycloakAdminSnapshot());
  }

  loadSnapshot(snapshot: KeycloakAdminSnapshot) {
    const rows = snapshot.clientRoles.map(({ client, role }) => {
      const counts = roleCounts(snapshot, role, client.id);
      return [
        role.id,
        role.name,
        client.id,
        client.clientId,
        client.name ?? client.clientId,
        role.description ?? "",
        counts.groupCount,
        counts.userCount,
        snapshot.timestamp,
        snapshot.timestamp,
        "",
      ];
    });
    reconcileTableRows(this.table, rows);
    this.loaded = true;
  }
}
