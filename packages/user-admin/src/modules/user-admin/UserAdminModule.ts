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
} from "../../contracts/UserAdminTypes";

const adminViewport = (
  table: DataTable,
  tableContainer: TableContainer,
  createOperations: () => Promise<UserAdminOperations>,
  refreshAfterMutation: (reason: string) => Promise<void>,
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
    new UserAdminService(tableContainer, createOperations, refreshAfterMutation),
  );
};

export type UserAdminModuleOptions = {
  createOperations: () => Promise<UserAdminOperations>;
  refreshAfterMutation: (reason: string) => Promise<void>;
  snapshotSource: UserAdminSnapshotSource;
};

const unavailable = async () => {
  throw new Error("User admin module is not configured");
};

export const UserAdminModule = ({
  createOperations = unavailable,
  refreshAfterMutation = unavailable,
  snapshotSource = unavailable,
}: Partial<UserAdminModuleOptions> = {}) => {
  configureUserAdminSnapshotSource(snapshotSource);
  return ModuleFactory.withNameSpace("USER_ADMIN")
    .addTable(
      usersTable,
      (table) => new UserAdminUsersProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        adminViewport(table, tableContainer, createOperations, refreshAfterMutation),
    )
    .addTable(
      groupsTable,
      (table) => new UserAdminGroupsProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        adminViewport(table, tableContainer, createOperations, refreshAfterMutation),
    )
    .addTable(
      clientsTable,
      (table) => new UserAdminClientsProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        adminViewport(table, tableContainer, createOperations, refreshAfterMutation),
    )
    .addTable(
      rolesTable,
      (table) => new UserAdminRolesProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        adminViewport(table, tableContainer, createOperations, refreshAfterMutation),
    )
    .addTable(
      userGroupsTable,
      (table) => new UserAdminUserGroupsProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        adminViewport(table, tableContainer, createOperations, refreshAfterMutation),
    )
    .addTable(
      groupRolesTable,
      (table) => new UserAdminGroupRolesProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        adminViewport(table, tableContainer, createOperations, refreshAfterMutation),
    )
    .addTable(
      userGroupRolesTable,
      (table) => new UserAdminUserGroupRolesProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        adminViewport(table, tableContainer, createOperations, refreshAfterMutation),
    )
    .asModule();
};
