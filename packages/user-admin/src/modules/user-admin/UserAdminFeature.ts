import type { ProviderContainer, TableContainer } from "@heswell/vuu-server";
import { UserAdminModule } from "./UserAdminModule";
import { InMemoryUserAdminStore } from "./InMemoryUserAdminStore";
import { UserAdminRefreshCoordinator } from "./UserAdminRefreshCoordinator";
import type { UserAdminModuleOptions } from "./UserAdminModule";
import type {
  UserAdminSnapshot,
  UserAdminSnapshotSource,
} from "../../contracts/UserAdminTypes";

export type UserAdminFeature = {
  module: ReturnType<typeof UserAdminModule>;
  install: (
    tableContainer: TableContainer,
    providerContainer: ProviderContainer,
  ) => UserAdminRefreshCoordinator;
};

export type UserAdminFeatureOptions = Omit<
  UserAdminModuleOptions,
  "refreshAfterMutation"
> & {
  refreshSnapshot?: UserAdminSnapshotSource;
};

export const createUserAdminFeature = (
  options: UserAdminFeatureOptions,
): UserAdminFeature => {
  let refreshCoordinator: UserAdminRefreshCoordinator | undefined;
  const refreshAfterMutation = async (reason: string) => {
    if (!refreshCoordinator) {
      throw new Error("User admin feature has not been installed");
    }
    await refreshCoordinator.refreshAll(reason);
  };

  return {
    module: UserAdminModule({
      ...options,
      refreshAfterMutation,
    }),
    install: (tableContainer, providerContainer) => {
      if (refreshCoordinator) return refreshCoordinator;
      refreshCoordinator = new UserAdminRefreshCoordinator(
        tableContainer,
        providerContainer,
        options.refreshSnapshot ?? options.snapshotSource,
      );
      return refreshCoordinator;
    },
  };
};

export const createInMemoryUserAdminFeature = (
  initial?: Partial<UserAdminSnapshot>,
) => {
  const store = new InMemoryUserAdminStore(initial);
  return {
    ...createUserAdminFeature({
      createOperations: async () => store,
      snapshotSource: store.snapshot,
    }),
    store,
  };
};
