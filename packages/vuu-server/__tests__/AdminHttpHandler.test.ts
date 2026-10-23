import { describe, expect, test } from "bun:test";
import {
  AdminRequestError,
  type AdminRoute,
  createVuuServerApplication,
  NotificationModule,
  PermissionFilter,
  ViewPortDef,
  type Config,
} from "../src";
import { DataTable } from "../src/core/table/InMemDataTable";
import { NullProvider } from "../src/provider/Provider";

const createApplication = (
  values: Record<string, string | number | boolean>,
  withNotifications = true,
  additionalAdminRoutes?: () => AdminRoute[],
) =>
  createVuuServerApplication({
    additionalAdminRoutes,
    authProviders: {},
    config: createConfig({ "vuu.ssl": false, ...values }),
    defaultHttpsPort: 8443,
    defaultWebSocketPort: 8091,
    modules: withNotifications
      ? [
          NotificationModule(
            (table) => new NullProvider(table),
            (viewport) =>
              PermissionFilter("audience", new Set(["all", viewport.user.name])),
            (table) => ViewPortDef.default(table.tableDef.columns),
            "source:String",
            "priority:Int",
          ),
        ]
      : [],
  });

const send = async (
  application: ReturnType<typeof createApplication>,
  path: string,
  init?: RequestInit,
) => {
  const url = new URL(`https://localhost:8443${path}`);
  return application.httpServerOptions.requestHandler?.(
    new Request(url.href, init),
    url,
  );
};

const post = (
  application: ReturnType<typeof createApplication>,
  body: unknown,
  path = "/api/admin/notifications",
) =>
  send(application, path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const notificationsTable = (application: ReturnType<typeof createApplication>) =>
  application.server.tableContainer.getTable<DataTable>("notifications");

describe("AdminHttpHandler", () => {
  test("is not installed unless vuu.admin.enabled", async () => {
    const application = createApplication({}, false, () => [
      { method: "GET", path: "/ping", handle: () => Response.json("pong") },
    ]);
    expect(await send(application, "/api/admin/ping")).toBeUndefined();
  });

  test("dispatches additional routes with path params", async () => {
    const application = createApplication(
      { "vuu.admin.enabled": true },
      false,
      () => [
        {
          method: "POST",
          path: "/prices/:ric",
          handle: ({ params }) => Response.json({ ric: params.ric }),
        },
        {
          method: "GET",
          path: "/fail",
          handle: () => {
            throw new AdminRequestError(409, "conflict");
          },
        },
      ],
    );
    const response = await send(application, "/api/admin/prices/VOD.L", {
      method: "POST",
    });
    expect(await response?.json()).toEqual({ ric: "VOD.L" });

    const wrongMethod = await send(application, "/api/admin/prices/VOD.L");
    expect(wrongMethod?.status).toBe(405);
    expect(wrongMethod?.headers.get("Allow")).toBe("POST");

    const failed = await send(application, "/api/admin/fail");
    expect(failed?.status).toBe(409);
    expect(await failed?.json()).toEqual({ error: "conflict" });

    expect((await send(application, "/api/admin/unknown"))?.status).toBe(404);
    expect(await send(application, "/api/other")).toBeUndefined();

    const index = await send(application, "/api/admin");
    expect(await index?.json()).toContainEqual({
      method: "POST",
      path: "/prices/:ric",
    });
  });
});

describe("NotificationAdminRoutes", () => {
  test("creates a notification with defaults", async () => {
    const application = createApplication({ "vuu.admin.enabled": true });
    const before = Date.now();
    const response = await post(application, {
      title: "Hello",
      message: "From curl",
      priority: 3,
    });
    expect(response?.status).toBe(201);
    const notification = (await response?.json()) as Record<string, unknown>;
    const id = notification.id as string;
    expect(id).toBeString();
    expect(notification).toMatchObject({
      type: "toast",
      title: "Hello",
      message: "From curl",
      level: "INFO",
      audience: "all",
      topic: "",
      priority: 3,
    });
    expect(notification.expiryTime as number).toBeGreaterThanOrEqual(
      before + 10_000,
    );

    const table = notificationsTable(application);
    expect(table.rows.length).toBe(1);
    expect(table.getRowAtKey(id)).toBeDefined();
  });

  test("publishes a notification with a topic", async () => {
    const application = createApplication({ "vuu.admin.enabled": true });
    const response = await post(application, {
      topic: "orders",
      level: "ERROR",
      title: "Order rejected",
    });
    expect(response?.status).toBe(201);
    const notification = (await response?.json()) as Record<string, unknown>;
    expect(notification).toMatchObject({
      topic: "orders",
      level: "ERROR",
      title: "Order rejected",
    });
    const table = notificationsTable(application);
    const row = table.getRowAtKey(notification.id as string);
    expect(row?.[table.columnMap.topic]).toBe("orders");

    const invalid = await post(application, { topic: 42 });
    expect(invalid?.status).toBe(400);
  });

  test("honours durationMs, configured path and explicit id; updates existing", async () => {
    const application = createApplication({
      "vuu.admin.enabled": true,
      "vuu.admin.path": "/dev",
    });
    const before = Date.now();
    const created = await post(
      application,
      { id: "n1", durationMs: 60_000, type: "banner" },
      "/dev/notifications",
    );
    const notification = (await created?.json()) as Record<string, unknown>;
    expect(notification.id).toBe("n1");
    expect(notification.type).toBe("banner");
    expect(notification.expiryTime as number).toBeGreaterThanOrEqual(
      before + 60_000,
    );

    await post(application, { id: "n1", level: "ERROR" }, "/dev/notifications");
    const listResponse = await send(application, "/dev/notifications");
    const list = (await listResponse?.json()) as Record<string, unknown>[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "n1", type: "banner", level: "ERROR" });
  });

  test("deletes a notification", async () => {
    const application = createApplication({ "vuu.admin.enabled": true });
    await post(application, { id: "n1" });
    const response = await send(application, "/api/admin/notifications/n1", {
      method: "DELETE",
    });
    expect(response?.status).toBe(204);
    expect(notificationsTable(application).rows.length).toBe(0);

    const missing = await send(application, "/api/admin/notifications/n1", {
      method: "DELETE",
    });
    expect(missing?.status).toBe(404);
  });

  test("rejects invalid requests", async () => {
    const application = createApplication({ "vuu.admin.enabled": true });
    expect((await post(application, { banana: 1 }))?.status).toBe(400);
    expect((await post(application, { priority: "high" }))?.status).toBe(400);
    expect((await post(application, [1, 2]))?.status).toBe(400);
    const notJson = await send(application, "/api/admin/notifications", {
      method: "POST",
      body: "not json",
    });
    expect(notJson?.status).toBe(400);
    const put = await send(application, "/api/admin/notifications", {
      method: "PUT",
    });
    expect(put?.status).toBe(405);
    expect(notificationsTable(application).rows.length).toBe(0);
  });

  test("returns 404 when no notifications module is registered", async () => {
    const application = createApplication({ "vuu.admin.enabled": true }, false);
    expect((await post(application, {}))?.status).toBe(404);
  });
});

function createConfig(values: Record<string, string | number | boolean>): Config {
  return {
    get: (key) => values[key],
    getBoolean: (key, defaultValue) =>
      values[key] === undefined ? required(defaultValue, key) : Boolean(values[key]),
    getNumber: (key, defaultValue) =>
      values[key] === undefined ? required(defaultValue, key) : Number(values[key]),
    getPath: (key, defaultValue) =>
      String(values[key] ?? required(defaultValue, key)),
    getString: (key, defaultValue) =>
      values[key] === undefined
        ? required(defaultValue, key)
        : String(values[key]),
    has: (key) => values[key] !== undefined,
    toObject: () => ({ ...values }),
  };
}

function required<T>(value: T | undefined, key: string): T {
  if (value === undefined) {
    throw new Error(`Missing required config key '${key}'`);
  }
  return value;
}
