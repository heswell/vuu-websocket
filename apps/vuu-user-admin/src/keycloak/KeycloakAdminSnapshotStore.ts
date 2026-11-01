import {
  KeycloakAdminClient,
  type KeycloakAdminSnapshot,
} from "./KeycloakAdminClient";

let snapshotPromise: Promise<KeycloakAdminSnapshot> | undefined;

/**
 * Providers are started independently by the VUU lifecycle. Keeping the
 * snapshot promise here makes those starts one server-side read rather than
 * one Keycloak read per table.
 */
export const getKeycloakAdminSnapshot = () => {
  if (!snapshotPromise) {
    snapshotPromise = KeycloakAdminClient.createFromConfig().then((client) =>
      client.readSnapshot(),
    );
  }
  return snapshotPromise;
};

export const refreshKeycloakAdminSnapshot = async () => {
  snapshotPromise = KeycloakAdminClient.createFromConfig().then((client) =>
    client.readSnapshot(),
  );
  return snapshotPromise;
};

export const clearKeycloakAdminSnapshot = () => {
  snapshotPromise = undefined;
};

export type { KeycloakAdminSnapshot };
