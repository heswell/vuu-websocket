import { type ProviderContainer, type TableContainer } from "@heswell/vuu-server";

const KEYCLOAK_ADMIN_TABLES = [
  "users",
  "groups",
  "roles",
  "user_group_roles",
] as const;

export class KeycloakAdminRefreshCoordinator {
  #inFlightRefresh: Promise<void> | undefined;

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

  private async runRefresh(reason: string) {
    console.log(`[KeycloakAdminRefreshCoordinator] refresh start ${reason}`);
    for (const tableName of KEYCLOAK_ADMIN_TABLES) {
      const provider = this.providerContainer.getProviderForTable(tableName);
      await provider.load(this.tableContainer);
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
