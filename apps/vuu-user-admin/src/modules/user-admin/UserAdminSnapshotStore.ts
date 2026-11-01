import type {
  UserAdminSnapshot,
  UserAdminSnapshotSource,
} from "@heswell/user-admin";

let snapshotSource: UserAdminSnapshotSource | undefined;

export const configureUserAdminSnapshotSource = (source: UserAdminSnapshotSource) => {
  snapshotSource = source;
};

export const getUserAdminSnapshot = async (): Promise<UserAdminSnapshot> => {
  if (!snapshotSource) {
    throw new Error("User admin snapshot source is not configured");
  }
  return snapshotSource();
};
