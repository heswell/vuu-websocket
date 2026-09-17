import { type ProviderContainer, type TableContainer } from "@heswell/vuu-server";
import type { UserAdminSnapshotSource } from "../../contracts/UserAdminTypes";

const USER_ADMIN_TABLES = [
  "users",
  "groups",
  "clients",
  "roles",
  "user_groups",
  "group_roles",
  "user_group_roles",
] as const;

export class UserAdminRefreshCoordinator {
  #inFlightRefresh: Promise<void> | undefined;
  #refreshTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly tableContainer: TableContainer,
    private readonly providerContainer: ProviderContainer,
    private readonly snapshotSource: UserAdminSnapshotSource,
  ) {}

  refreshAll(reason: string) {
    if (this.#inFlightRefresh) return this.#inFlightRefresh;
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
        console.error("[UserAdminRefreshCoordinator] interval refresh failed", error);
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
    console.log(`[UserAdminRefreshCoordinator] refresh start ${reason}`);
    const snapshot = await this.snapshotSource();
    for (const tableName of USER_ADMIN_TABLES) {
      const provider = this.providerContainer.getProviderForTable(tableName);
      if ("loadSnapshot" in provider && typeof provider.loadSnapshot === "function") {
        provider.loadSnapshot(snapshot);
      } else {
        await provider.load(this.tableContainer);
      }
    }
    console.log(`[UserAdminRefreshCoordinator] refresh complete ${reason}`);
  }
}
