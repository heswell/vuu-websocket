import { ModuleFactory } from "@heswell/vuu-server";
import { groupsTable, rolesTable, usersTable } from "./KeycloakAdminTableDefs";
import { KeycloakGroupsProvider } from "./providers/KeycloakGroupsProvider";
import { KeycloakRolesProvider } from "./providers/KeycloakRolesProvider";
import { KeycloakUsersProvider } from "./providers/KeycloakUsersProvider";

export const KeycloakAdminModule = () =>
  ModuleFactory.withNameSpace("KEYCLOAK_ADMIN")
    .addTable(usersTable, (table) => new KeycloakUsersProvider(table))
    .addTable(groupsTable, (table) => new KeycloakGroupsProvider(table))
    .addTable(rolesTable, (table) => new KeycloakRolesProvider(table))
    .asModule();
