import { TableDef } from "@heswell/vuu-server";

export const usersTable = TableDef({
  columns: [
    { name: "id", dataType: "string" },
    { name: "username", dataType: "string" },
    { name: "email", dataType: "string" },
    { name: "enabled", dataType: "string" },
    { name: "groups", dataType: "string" },
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
  ],
  keyField: "id",
  name: "groups",
});

export const rolesTable = TableDef({
  columns: [
    { name: "id", dataType: "string" },
    { name: "name", dataType: "string" },
    { name: "description", dataType: "string" },
  ],
  keyField: "id",
  name: "roles",
});
