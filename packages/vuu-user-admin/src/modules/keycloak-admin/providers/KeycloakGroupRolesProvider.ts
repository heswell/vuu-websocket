import { Provider, type TableContainer } from "@heswell/vuu-server";
import type { KeycloakAdminSnapshot } from "../KeycloakAdminClient";
import { getKeycloakAdminSnapshot } from "../KeycloakAdminSnapshotStore";
import { reconcileTableRows } from "./reconcileTableRows";

export class KeycloakGroupRolesProvider extends Provider {
  async load(_: TableContainer) {
    this.loadSnapshot(await getKeycloakAdminSnapshot());
  }

  loadSnapshot(snapshot: KeycloakAdminSnapshot) {
    const rows = snapshot.groupRoles.map(({ group, role, client }) => [
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
