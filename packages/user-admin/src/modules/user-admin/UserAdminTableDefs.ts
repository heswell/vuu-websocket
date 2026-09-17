import { TableDef } from "@heswell/vuu-server";
import {
  USER_ADMIN_TABLE_SCHEMAS,
  type UserAdminTableName,
} from "../../contracts";

const tableDef = (name: UserAdminTableName) => {
  const schema = USER_ADMIN_TABLE_SCHEMAS[name];
  return TableDef({
    columns: schema.columns.map(({ name, serverDataType: dataType }) => ({
      dataType,
      name,
    })),
    keyField: schema.key,
    name,
  });
};

export const usersTable = tableDef("users");
export const groupsTable = tableDef("groups");
export const clientsTable = tableDef("clients");
export const rolesTable = tableDef("roles");
export const userGroupsTable = tableDef("user_groups");
export const groupRolesTable = tableDef("group_roles");
export const userGroupRolesTable = tableDef("user_group_roles");
