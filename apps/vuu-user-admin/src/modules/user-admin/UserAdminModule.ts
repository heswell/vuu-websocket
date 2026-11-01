import {
  Column,
  ModuleFactory,
  ViewPortDef,
  type DataTable,
  type TableContainer,
} from "@heswell/vuu-server";
import {
  clientsTable,
  groupRolesTable,
  groupsTable,
  rolesTable,
  userGroupsTable,
  userGroupRolesTable,
  usersTable,
} from "./UserAdminTableDefs";
import { UserAdminClientsProvider } from "./providers/UserAdminClientsProvider";
import { UserAdminGroupRolesProvider } from "./providers/UserAdminGroupRolesProvider";
import { UserAdminGroupsProvider } from "./providers/UserAdminGroupsProvider";
import { UserAdminRolesProvider } from "./providers/UserAdminRolesProvider";
import { UserAdminUserGroupsProvider } from "./providers/UserAdminUserGroupsProvider";
import { UserAdminUserGroupRolesProvider } from "./providers/UserAdminUserGroupRolesProvider";
import { UserAdminUsersProvider } from "./providers/UserAdminUsersProvider";
import { UserAdminService } from "./services/UserAdminService";
import {
  configureUserAdminSnapshotSource,
} from "./UserAdminSnapshotStore";
import type {
  UserAdminOperations,
  UserAdminSnapshotSource,
} from "@heswell/user-admin";

const adminViewport = (
  table: DataTable,
  tableContainer: TableContainer,
  createOperations: () => Promise<UserAdminOperations>,
  refreshAfterMutation: (reason: string) => Promise<void>,
  readSnapshot: UserAdminSnapshotSource,
): ReturnType<typeof ViewPortDef> => {
  const columns: Column[] = table.schema.columns.map(
    ({ name, serverDataType: dataType }, index) => ({
      name,
      dataType,
      index,
    }),
  );
  return ViewPortDef(
    columns,
    new UserAdminService(
      tableContainer,
      createOperations,
      refreshAfterMutation,
      readSnapshot,
    ),
  );
};

export type UserAdminModuleOptions = {
  createOperations: () => Promise<UserAdminOperations>;
  refreshAfterMutation: (reason: string) => Promise<void>;
  snapshotSource: UserAdminSnapshotSource;
  /**
   * Reads current identity-provider state when validating edits. Defaults to
   * snapshotSource, which may be cached.
   */
  readSnapshot?: UserAdminSnapshotSource;
};

const unavailable = async () => {
  throw new Error("User admin module is not configured");
};

export const UserAdminModule = ({
  createOperations = unavailable,
  refreshAfterMutation = unavailable,
  snapshotSource = unavailable,
  readSnapshot = snapshotSource,
}: Partial<UserAdminModuleOptions> = {}) => {
  configureUserAdminSnapshotSource(snapshotSource);
  const viewport = (
    table: DataTable,
    tableContainer: TableContainer,
  ) =>
    adminViewport(
      table,
      tableContainer,
      createOperations,
      refreshAfterMutation,
      readSnapshot,
    );
  return ModuleFactory.withNameSpace("USER_ADMIN")
    .addTable(
      usersTable,
      (table) => new UserAdminUsersProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        viewport(table, tableContainer),
    )
    .addTable(
      groupsTable,
      (table) => new UserAdminGroupsProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        viewport(table, tableContainer),
    )
    .addTable(
      clientsTable,
      (table) => new UserAdminClientsProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        viewport(table, tableContainer),
    )
    .addTable(
      rolesTable,
      (table) => new UserAdminRolesProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        viewport(table, tableContainer),
    )
    .addTable(
      userGroupsTable,
      (table) => new UserAdminUserGroupsProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        viewport(table, tableContainer),
    )
    .addTable(
      groupRolesTable,
      (table) => new UserAdminGroupRolesProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        viewport(table, tableContainer),
    )
    .addTable(
      userGroupRolesTable,
      (table) => new UserAdminUserGroupRolesProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        viewport(table, tableContainer),
    )
    .asModule();
};
