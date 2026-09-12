import { type ProviderContainer, type TableContainer } from "@heswell/vuu-server";
import type { KeycloakAdminSnapshot } from "./KeycloakAdminClient";
import { refreshKeycloakAdminSnapshot } from "./KeycloakAdminSnapshotStore";

const KEYCLOAK_ADMIN_TABLES = [
  "users",
  "groups",
  "clients",
  "roles",
  "user_groups",
  "group_roles",
  "user_group_roles",
] as const;

export class KeycloakAdminRefreshCoordinator {
  #inFlightRefresh: Promise<void> | undefined;
  #refreshTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly tableContainer: TableContainer,
    private readonly providerContainer: ProviderContainer,
  ) {}

  refreshAll(reason: string) {
    if (this.#inFlightRefresh) {
      return this.#inFlightRefresh;
    }

    this.#inFlightRefresh = this.runRefresh(reason).finally(() => {
      this.#inFlightRefresh = undefined;
    });

    return this.#inFlightRefresh;
  }

  startPeriodicRefresh(intervalMs: number) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0 || this.#refreshTimer) {
      return;
    }
    this.#refreshTimer = setInterval(() => {
      void this.refreshAll("interval").catch((error) => {
        console.error("[KeycloakAdminRefreshCoordinator] interval refresh failed", error);
      });
    }, intervalMs);
    this.#refreshTimer.unref?.();
  }

  stopPeriodicRefresh() {
    if (this.#refreshTimer) {
      clearInterval(this.#refreshTimer);
      this.#refreshTimer = undefined;
    }
  }

  private async runRefresh(reason: string) {
    console.log(`[KeycloakAdminRefreshCoordinator] refresh start ${reason}`);
    const snapshot = await refreshKeycloakAdminSnapshot();
    for (const tableName of KEYCLOAK_ADMIN_TABLES) {
      const provider = this.providerContainer.getProviderForTable(tableName);
      if ("loadSnapshot" in provider && typeof provider.loadSnapshot === "function") {
        provider.loadSnapshot(snapshot);
      } else {
        await provider.load(this.tableContainer);
      }
    }
    console.log(`[KeycloakAdminRefreshCoordinator] refresh complete ${reason}`);
  }
}

let refreshCoordinator: KeycloakAdminRefreshCoordinator | undefined;

export const installKeycloakAdminRefreshCoordinator = (
  tableContainer: TableContainer,
  providerContainer: ProviderContainer,
) => {
  refreshCoordinator = new KeycloakAdminRefreshCoordinator(
    tableContainer,
    providerContainer,
  );
  return refreshCoordinator;
};

export const getKeycloakAdminRefreshCoordinator = () => refreshCoordinator;
