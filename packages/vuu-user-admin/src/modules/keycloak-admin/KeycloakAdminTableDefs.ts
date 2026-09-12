import { TableDef, VUU_DEFAULT_COLUMNS } from "@heswell/vuu-server";

const auditColumns = VUU_DEFAULT_COLUMNS;

export const usersTable = TableDef({
  columns: [
    { name: "user_id", dataType: "string" },
    { name: "username", dataType: "string" },
    { name: "email", dataType: "string" },
    { name: "first_name", dataType: "string" },
    { name: "last_name", dataType: "string" },
    { name: "enabled", dataType: "boolean" },
    { name: "email_verified", dataType: "boolean" },
    { name: "password_update_required", dataType: "boolean" },
    { name: "last_login", dataType: "long" },
    { name: "created_at", dataType: "long" },
    { name: "group_count", dataType: "int" },
    { name: "role_count", dataType: "int" },
    { name: "module_access", dataType: "string" },
    { name: "module_access_count", dataType: "int" },
    ...auditColumns,
  ],
  keyField: "user_id",
  name: "users",
});

export const groupsTable = TableDef({
  columns: [
    { name: "group_id", dataType: "string" },
    { name: "group_name", dataType: "string" },
    { name: "group_path", dataType: "string" },
    { name: "parent_group_id", dataType: "string" },
    { name: "user_count", dataType: "int" },
    { name: "role_count", dataType: "int" },
    { name: "created_at", dataType: "long" },
    ...auditColumns,
  ],
  keyField: "group_id",
  name: "groups",
});

export const clientsTable = TableDef({
  columns: [
    { name: "client_id", dataType: "string" },
    { name: "client_identifier", dataType: "string" },
    { name: "client_name", dataType: "string" },
    { name: "description", dataType: "string" },
    { name: "enabled", dataType: "boolean" },
    ...auditColumns,
  ],
  keyField: "client_id",
  name: "clients",
});

export const rolesTable = TableDef({
  columns: [
    { name: "role_id", dataType: "string" },
    { name: "role_name", dataType: "string" },
    { name: "client_id", dataType: "string" },
    { name: "client_identifier", dataType: "string" },
    { name: "client_name", dataType: "string" },
    { name: "description", dataType: "string" },
    { name: "group_count", dataType: "int" },
    { name: "user_count", dataType: "int" },
    { name: "created_at", dataType: "long" },
    ...auditColumns,
  ],
  keyField: "role_id",
  name: "roles",
});

export const userGroupsTable = TableDef({
  columns: [
    { name: "membership_id", dataType: "string" },
    { name: "user_id", dataType: "string" },
    { name: "username", dataType: "string" },
    { name: "group_id", dataType: "string" },
    { name: "group_name", dataType: "string" },
    { name: "group_path", dataType: "string" },
    ...auditColumns,
  ],
  keyField: "membership_id",
  name: "user_groups",
});

export const groupRolesTable = TableDef({
  columns: [
    { name: "assignment_id", dataType: "string" },
    { name: "group_id", dataType: "string" },
    { name: "group_name", dataType: "string" },
    { name: "role_id", dataType: "string" },
    { name: "role_name", dataType: "string" },
    { name: "client_id", dataType: "string" },
    { name: "client_identifier", dataType: "string" },
    { name: "client_name", dataType: "string" },
    ...auditColumns,
  ],
  keyField: "assignment_id",
  name: "group_roles",
});

/** Flattened compatibility projection joining user, group, and role data. */
export const userGroupRolesTable = TableDef({
  columns: [
    { name: "id", dataType: "string" },
    { name: "membership_id", dataType: "string" },
    { name: "assignment_id", dataType: "string" },
    { name: "user_id", dataType: "string" },
    { name: "username", dataType: "string" },
    { name: "email", dataType: "string" },
    { name: "first_name", dataType: "string" },
    { name: "last_name", dataType: "string" },
    { name: "enabled", dataType: "boolean" },
    { name: "email_verified", dataType: "boolean" },
    { name: "password_update_required", dataType: "boolean" },
    { name: "last_login", dataType: "long" },
    { name: "group_id", dataType: "string" },
    { name: "group_name", dataType: "string" },
    { name: "group_path", dataType: "string" },
    { name: "role_id", dataType: "string" },
    { name: "role_name", dataType: "string" },
    { name: "client_id", dataType: "string" },
    { name: "client_identifier", dataType: "string" },
    { name: "client_name", dataType: "string" },
    ...auditColumns,
  ],
  keyField: "id",
  name: "user_group_roles",
});
