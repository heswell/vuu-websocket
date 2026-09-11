import { Provider, type TableContainer } from "@heswell/vuu-server";
import type { KeycloakAdminSnapshot } from "../KeycloakAdminClient";
import { getKeycloakAdminSnapshot } from "../KeycloakAdminSnapshotStore";
import { reconcileTableRows } from "./reconcileTableRows";
import {
  keycloakTimestamp,
  lastLogin,
  userGroupCount,
  userRoleCount,
} from "./snapshotCounts";

export class KeycloakUsersProvider extends Provider {
  async load(_: TableContainer) {
    this.loadSnapshot(await getKeycloakAdminSnapshot());
  }

  loadSnapshot(snapshot: KeycloakAdminSnapshot) {
    const { timestamp } = snapshot;
    const rows = snapshot.users.map((user) => [
      user.id,
      user.username,
      user.email ?? "",
      user.firstName ?? "",
      user.lastName ?? "",
      user.enabled ?? false,
      user.emailVerified ?? false,
      user.requiredActions?.includes("UPDATE_PASSWORD") ?? false,
      lastLogin(user),
      keycloakTimestamp(user.createdTimestamp),
      userGroupCount(snapshot, user.id),
      userRoleCount(snapshot, user.id),
      timestamp,
      timestamp,
      "",
    ]);
    reconcileTableRows(this.table, rows);
    this.loaded = true;
  }
}
