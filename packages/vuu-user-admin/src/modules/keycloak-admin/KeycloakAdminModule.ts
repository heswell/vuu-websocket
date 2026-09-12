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
} from "./KeycloakAdminTableDefs";
import { KeycloakClientsProvider } from "./providers/KeycloakClientsProvider";
import { KeycloakGroupRolesProvider } from "./providers/KeycloakGroupRolesProvider";
import { KeycloakGroupsProvider } from "./providers/KeycloakGroupsProvider";
import { KeycloakRolesProvider } from "./providers/KeycloakRolesProvider";
import { KeycloakUserGroupsProvider } from "./providers/KeycloakUserGroupsProvider";
import { KeycloakUserGroupRolesProvider } from "./providers/KeycloakUserGroupRolesProvider";
import { KeycloakUsersProvider } from "./providers/KeycloakUsersProvider";
import { KeycloakAdminService } from "./services/KeycloakAdminService";

const adminViewport = (
  table: DataTable,
  tableContainer: TableContainer,
): ReturnType<typeof ViewPortDef> => {
  const columns: Column[] = table.schema.columns.map(
    ({ name, serverDataType: dataType }, index) => ({
      name,
      dataType,
      index,
    }),
  );
  return ViewPortDef(columns, new KeycloakAdminService(tableContainer));
};

export const KeycloakAdminModule = () =>
  ModuleFactory.withNameSpace("KEYCLOAK_ADMIN")
    .addTable(
      usersTable,
      (table) => new KeycloakUsersProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        adminViewport(table, tableContainer),
    )
    .addTable(
      groupsTable,
      (table) => new KeycloakGroupsProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        adminViewport(table, tableContainer),
    )
    .addTable(
      clientsTable,
      (table) => new KeycloakClientsProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        adminViewport(table, tableContainer),
    )
    .addTable(
      rolesTable,
      (table) => new KeycloakRolesProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        adminViewport(table, tableContainer),
    )
    .addTable(
      userGroupsTable,
      (table) => new KeycloakUserGroupsProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        adminViewport(table, tableContainer),
    )
    .addTable(
      groupRolesTable,
      (table) => new KeycloakGroupRolesProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        adminViewport(table, tableContainer),
    )
    .addTable(
      userGroupRolesTable,
      (table) => new KeycloakUserGroupRolesProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        adminViewport(table, tableContainer),
    )
    .asModule();
