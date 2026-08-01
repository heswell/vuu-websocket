import { TableDef } from "@heswell/vuu-server";

export const modulesTable = TableDef({
  columns: [
    { name: "id", dataType: "int" },
    { name: "name", dataType: "string" },
    { name: "title", dataType: "string" },
    { name: "description", dataType: "string" },
    { name: "version", dataType: "int" },
    { name: "enabled", dataType: "boolean" },
    { name: "location", dataType: "string" },
    { name: "mfComponent", dataType: "string" },
    { name: "mfScope", dataType: "string" },
    { name: "mfUrl", dataType: "string" },
  ],
  keyField: "id",
  name: "modules",
});

export const modulePermissionsTable = TableDef({
  columns: [
    { name: "id", dataType: "int" },
    { name: "module_id", dataType: "int" },
    { name: "role", dataType: "string" },
  ],
  keyField: "id",
  name: "modulePermissions",
});

export const moduleUsersTable = TableDef({
  columns: [
    { name: "id", dataType: "int" },
    { name: "module_id", dataType: "int" },
    { name: "username", dataType: "string" },
  ],
  keyField: "id",
  name: "moduleUsers",
});
