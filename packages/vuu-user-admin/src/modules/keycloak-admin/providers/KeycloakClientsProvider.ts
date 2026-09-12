import { Provider, type TableContainer } from "@heswell/vuu-server";
import type { KeycloakAdminSnapshot } from "../KeycloakAdminClient";
import { getKeycloakAdminSnapshot } from "../KeycloakAdminSnapshotStore";
import { reconcileTableRows } from "./reconcileTableRows";

export class KeycloakClientsProvider extends Provider {
  async load(_: TableContainer) {
    this.loadSnapshot(await getKeycloakAdminSnapshot());
  }

  loadSnapshot(snapshot: KeycloakAdminSnapshot) {
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
