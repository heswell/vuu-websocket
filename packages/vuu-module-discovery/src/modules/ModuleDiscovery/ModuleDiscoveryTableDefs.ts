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
    { name: "path", dataType: "string" },
    { name: "mfComponent", dataType: "string" },
    { name: "mfScope", dataType: "string" },
    { name: "mfUrl", dataType: "string" },
    { name: "vuuConnectionId", dataType: "string" },
    { name: "vuuWebsocketUrl", dataType: "string" },
    { name: "vuuRestUrl", dataType: "string" },
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
