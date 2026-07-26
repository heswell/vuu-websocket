import { ModuleFactory } from "@heswell/vuu-server";
import {
  groupsTable,
  rolesTable,
  userGroupRolesTable,
  usersTable,
} from "./KeycloakAdminTableDefs";
import { KeycloakGroupsProvider } from "./providers/KeycloakGroupsProvider";
import { KeycloakRolesProvider } from "./providers/KeycloakRolesProvider";
import { KeycloakUserGroupRolesProvider } from "./providers/KeycloakUserGroupRolesProvider";
import { KeycloakUsersProvider } from "./providers/KeycloakUsersProvider";

export const KeycloakAdminModule = () =>
  ModuleFactory.withNameSpace("KEYCLOAK_ADMIN")
    .addTable(usersTable, (table) => new KeycloakUsersProvider(table))
    .addTable(groupsTable, (table) => new KeycloakGroupsProvider(table))
    .addTable(rolesTable, (table) => new KeycloakRolesProvider(table))
    .addTable(userGroupRolesTable, (table) => new KeycloakUserGroupRolesProvider(table))
    .asModule();
