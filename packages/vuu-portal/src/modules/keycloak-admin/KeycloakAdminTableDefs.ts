import { TableDef } from "@heswell/vuu-server";

const VUU_AUDIT_COLUMNS = [
  { name: "vuuCreatedTimestamp", dataType: "long" as const },
  { name: "vuuUpdatedTimestamp", dataType: "long" as const },
  { name: "vuuMsg", dataType: "string" as const },
];

export const usersTable = TableDef({
  columns: [
    { name: "id", dataType: "string" },
    { name: "username", dataType: "string" },
    { name: "email", dataType: "string" },
    { name: "enabled", dataType: "string" },
    ...VUU_AUDIT_COLUMNS,
  ],
  keyField: "id",
  name: "users",
});

export const groupsTable = TableDef({
  columns: [
    { name: "id", dataType: "string" },
    { name: "name", dataType: "string" },
    { name: "path", dataType: "string" },
    { name: "roles", dataType: "string" },
    ...VUU_AUDIT_COLUMNS,
  ],
  keyField: "id",
  name: "groups",
});

export const rolesTable = TableDef({
  columns: [
    { name: "id", dataType: "string" },
    { name: "name", dataType: "string" },
    { name: "description", dataType: "string" },
    ...VUU_AUDIT_COLUMNS,
  ],
  keyField: "id",
  name: "roles",
});

export const userGroupRolesTable = TableDef({
  columns: [
    { name: "id", dataType: "string" },
    { name: "user_id", dataType: "string" },
    { name: "username", dataType: "string" },
    { name: "email", dataType: "string" },
    { name: "enabled", dataType: "string" },
    { name: "group_id", dataType: "string" },
    { name: "group_name", dataType: "string" },
    { name: "role_id", dataType: "string" },
    { name: "role_name", dataType: "string" },
    ...VUU_AUDIT_COLUMNS,
  ],
  keyField: "id",
  name: "user_group_roles",
});
