import { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import { NotificationModule } from "../../../core/module/notifications/NotificationModule";
import { DataTable } from "../../../core/table/InMemDataTable";
import { TableContainer } from "../../../core/table/TableContainer";
import { AdminRequestError, AdminRoute, readJsonObject } from "./AdminHttpHandler";

export type NotificationAdminRoutesOptions = {
  defaultDurationMs?: number;
};

const NumericTypes = new Set([
  "double",
  "epochtimestamp",
  "int",
  "long",
  "scaleddecimal2",
  "scaleddecimal4",
  "scaleddecimal6",
  "scaleddecimal8",
]);

/**
 * Admin routes to inject notifications into (or remove them from) the
 * 'notifications' table of a registered NotificationModule, e.g.
 *
 *   curl -k -X POST https://localhost:8443/api/admin/notifications \
 *     -H 'Content-Type: application/json' \
 *     -d '{"title":"Hello","message":"From curl","level":"WARNING","topic":"orders"}'
 *
 *   GET    /notifications       list current notifications
 *   POST   /notifications       create (or update, if id supplied) a notification
 *   DELETE /notifications/:id   remove a notification
 */
export function createNotificationAdminRoutes(
  getTableContainer: () => TableContainer,
  { defaultDurationMs = 10_000 }: NotificationAdminRoutesOptions = {},
): AdminRoute[] {
  const getTable = () => {
    try {
      return getTableContainer().getTable<DataTable>(
        NotificationModule.TABLE_NAME,
      );
    } catch {
      throw new AdminRequestError(404, "No notifications module is registered");
    }
  };

  return [
    {
      method: "GET",
      path: "/notifications",
      handle: () => {
        const table = getTable();
        return Response.json(table.rows.map((row) => toObject(table, row)));
      },
    },
    {
      method: "POST",
      path: "/notifications",
      handle: async ({ req }) => {
        const table = getTable();
        const row = createRow(table, await readJsonObject(req), defaultDurationMs);
        table.upsert(row);
        return Response.json(toObject(table, row), { status: 201 });
      },
    },
    {
      method: "DELETE",
      path: "/notifications/:id",
      handle: ({ params: { id } }) => {
        const table = getTable();
        if (!table.getRowAtKey(id, false)) {
          throw new AdminRequestError(404, `Notification '${id}' not found`);
        }
        table.delete(id);
        return new Response(null, { status: 204 });
      },
    },
  ];
}

function createRow(
  table: DataTable,
  { durationMs, ...values }: Record<string, unknown>,
  defaultDurationMs: number,
): VuuDataRow {
  if (durationMs !== undefined && typeof durationMs !== "number") {
    throw new AdminRequestError(400, "'durationMs' must be a number");
  }
  const now = Date.now();
  const id = values.id ?? crypto.randomUUID();
  const existingRow =
    typeof id === "string" ? table.getRowAtKey(id, false) : undefined;

  const defaults: Record<string, VuuRowDataItemType> = existingRow
    ? { vuuUpdatedTimestamp: now }
    : {
        audience: "all",
        expiryTime: now + (durationMs ?? defaultDurationMs),
        level: "INFO",
        message: "",
        title: "Admin notification",
        topic: "",
        type: "toast",
        vuuCreatedTimestamp: now,
        vuuUpdatedTimestamp: now,
      };
  if (existingRow && durationMs !== undefined) {
    defaults.expiryTime = now + durationMs;
  }

  const row: VuuDataRow = existingRow
    ? existingRow.slice()
    : Array(table.schema.columns.length);
  const { columnMap } = table;

  for (const [name, value] of Object.entries(defaults)) {
    if (columnMap[name] !== undefined) {
      row[columnMap[name]] = value;
    }
  }

  for (const [name, value] of Object.entries({ ...values, id })) {
    const column = table.schema.columns.find((c) => c.name === name);
    if (!column) {
      throw new AdminRequestError(400, `Unknown notification column '${name}'`);
    }
    row[columnMap[name]] = validateValue(name, column.serverDataType, value);
  }

  return row;
}

function validateValue(
  name: string,
  dataType: string,
  value: unknown,
): VuuRowDataItemType {
  const expectedType = NumericTypes.has(dataType)
    ? "number"
    : dataType === "boolean"
      ? "boolean"
      : "string";
  if (typeof value !== expectedType) {
    throw new AdminRequestError(
      400,
      `Column '${name}' (${dataType}) expects a ${expectedType} value`,
    );
  }
  return value as VuuRowDataItemType;
}

function toObject(table: DataTable, row: VuuDataRow) {
  return Object.fromEntries(
    table.schema.columns.map(({ name }) => [name, row[table.columnMap[name]]]),
  );
}
