import { Provider, type TableContainer } from "@heswell/vuu-server";
import type { KeycloakAdminSnapshot } from "../KeycloakAdminClient";
import { getKeycloakAdminSnapshot } from "../KeycloakAdminSnapshotStore";
import { reconcileTableRows } from "./reconcileTableRows";
import { lastLogin } from "./snapshotCounts";

export class KeycloakUserGroupRolesProvider extends Provider {
  async load(_: TableContainer) {
    this.loadSnapshot(await getKeycloakAdminSnapshot());
  }

  loadSnapshot(snapshot: KeycloakAdminSnapshot) {
    const rows = snapshot.groupRoles.flatMap(({ group, role, client }) =>
      snapshot.userGroups
        .filter(({ group: userGroup }) => userGroup.id === group.id)
        .map(({ user }) => {
          const membershipId = `${user.id}:${group.id}`;
          const assignmentId = `${group.id}:${client?.id ?? "realm"}:${role.id}`;
          return [
            `${membershipId}:${assignmentId}`,
            membershipId,
            assignmentId,
            user.id,
            user.username,
            user.email ?? "",
            user.firstName ?? "",
            user.lastName ?? "",
            user.enabled ?? false,
            user.emailVerified ?? false,
            user.requiredActions?.includes("UPDATE_PASSWORD") ?? false,
            lastLogin(user),
            group.id,
            group.name,
            group.path ?? "",
            role.id,
            role.name,
            client?.id ?? "",
            client?.clientId ?? "",
            client?.name ?? client?.clientId ?? "",
            snapshot.timestamp,
            snapshot.timestamp,
            "",
          ];
        }),
    );
    reconcileTableRows(this.table, rows);
    this.loaded = true;
  }
}
