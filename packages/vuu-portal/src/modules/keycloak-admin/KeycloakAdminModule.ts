import { Column, ModuleFactory, ViewPortDef } from "@heswell/vuu-server";
import {
  groupRolesTable,
  groupsTable,
  rolesTable,
  userGroupRolesTable,
  usersTable,
} from "./KeycloakAdminTableDefs";
import { KeycloakGroupRolesProvider } from "./providers/KeycloakGroupRolesProvider";
import { KeycloakGroupsProvider } from "./providers/KeycloakGroupsProvider";
import { KeycloakRolesProvider } from "./providers/KeycloakRolesProvider";
import { KeycloakUserGroupRolesProvider } from "./providers/KeycloakUserGroupRolesProvider";
import { KeycloakUsersProvider } from "./providers/KeycloakUsersProvider";
import { KeycloakAdminService } from "./services/KeycloakAdminService";

export const KeycloakAdminModule = () =>
  ModuleFactory.withNameSpace("KEYCLOAK_ADMIN")
    .addTable(
      usersTable,
      (table) => new KeycloakUsersProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        ViewPortDef(
          table.schema.columns.map<Column>(({ name, serverDataType: dataType }) => ({
            name,
            dataType,
          })),
          new KeycloakAdminService(tableContainer),
        ),
    )
    .addTable(groupsTable, (table) => new KeycloakGroupsProvider(table))
    .addTable(rolesTable, (table) => new KeycloakRolesProvider(table))
    .addTable(groupRolesTable, (table) => new KeycloakGroupRolesProvider(table))
    .addTable(userGroupRolesTable, (table) => new KeycloakUserGroupRolesProvider(table))
    .asModule();
