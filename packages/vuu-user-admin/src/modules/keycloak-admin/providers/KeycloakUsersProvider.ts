import { Provider, type TableContainer } from "@heswell/vuu-server";
import type { KeycloakAdminSnapshot } from "../KeycloakAdminClient";
import { getKeycloakAdminSnapshot } from "../KeycloakAdminSnapshotStore";
import { reconcileTableRows } from "./reconcileTableRows";
import {
  lastLogin,
  userGroupCount,
  userModuleAccess,
  userRoleCount,
} from "./snapshotCounts";

export class KeycloakUsersProvider extends Provider {
  async load(_: TableContainer) {
    this.loadSnapshot(await getKeycloakAdminSnapshot());
  }

  loadSnapshot(snapshot: KeycloakAdminSnapshot) {
    const { timestamp } = snapshot;
    const rows = snapshot.users.map((user) => {
      const moduleAccess = userModuleAccess(snapshot, user.id);
      return [
        user.id,
        user.username,
        user.email ?? "",
        user.firstName ?? "",
        user.lastName ?? "",
        user.enabled ?? false,
        user.emailVerified ?? false,
        user.requiredActions?.includes("UPDATE_PASSWORD") ?? false,
        lastLogin(user),
        userGroupCount(snapshot, user.id),
        userRoleCount(snapshot, user.id),
        moduleAccess.value,
        moduleAccess.count,
        timestamp,
        timestamp,
        "",
      ];
    });
    reconcileTableRows(this.table, rows);
    this.loaded = true;
  }
}
