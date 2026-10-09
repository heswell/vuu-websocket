import { describe, expect, test } from "bun:test";
import { Table } from "@heswell/vuu-table";
import { RemoteTableSubscription } from "../../service-utils/src/publisher";
import { TestRemoteResourceSocket } from "../../service-utils/__tests__/TestRemoteResourceSocket";
import { TableDef } from "../src/api/TableDef";
import { VuuServer } from "../src/core/VuuServer";
import {
  VuuServerConfig,
  VuuWebSocketOptions,
} from "../src/core/VuuServerOptions";
import { ModuleFactory } from "../src/core/module/ModuleFactory";
import { ViewServerModule } from "../src/core/module/VsModule";
import { LoginTokenService } from "../src/net/auth/LoginTokenService";
import {
  NullProvider,
  Provider,
  RemoteProvider,
  type RemoteServiceDetails,
} from "../src/provider/Provider";
import { LifecycleContainer } from "../src/toolbox/thread/LifecycleContainer";

const tableDef = (name: string) =>
  TableDef({
    columns: [{ name: "id", dataType: "string" }],
    joinFields: "id",
    keyField: "id",
    name,
  });

const serverConfig = (
  module: ViewServerModule,
) =>
  VuuServerConfig(
    VuuWebSocketOptions().withWsPort(0),
    {},
    LoginTokenService(),
  ).withModule(module);

describe("VuuServer lifecycle", () => {
  test("waits for providers before opening endpoints, loads once, refreshes explicitly, and shuts down", async () => {
    const providerReady = Promise.withResolvers<void>();
    let provider: RecordingProvider | undefined;
    const lifecycle = new LifecycleContainer();
    const module = ModuleFactory.withNameSpace("LIFECYCLE_READINESS")
      .addTable(tableDef("readiness"), (table) => {
        provider = new RecordingProvider(table, () => providerReady.promise);
        return provider;
      })
      .asModule();
    const server = new VuuServer(serverConfig(module), lifecycle);

    expect(server.webSocketPort).toBeUndefined();
    const startup = lifecycle.start();
    await Bun.sleep(1);
    expect(provider?.loadCount).toBe(1);
    expect(server.webSocketPort).toBeUndefined();

    providerReady.resolve();
    await startup;
    const port = server.webSocketPort;
    expect(port).toBeNumber();
    expect((await fetch(`http://127.0.0.1:${port}`)).status).toBe(404);
    expect(provider?.loaded).toBe(true);

    await provider?.load(server.tableContainer);
    expect(provider?.loadCount).toBe(2);

    await lifecycle.destroy();
    expect(provider?.stopCount).toBe(1);
    expect(server.webSocketPort).toBeUndefined();
    await expect(fetch(`http://127.0.0.1:${port}`)).rejects.toThrow();
  });

  test("surfaces provider failure and rolls back without opening an endpoint", async () => {
    let provider: RecordingProvider | undefined;
    const lifecycle = new LifecycleContainer();
    const module = ModuleFactory.withNameSpace("LIFECYCLE_FAILURE")
      .addTable(tableDef("failure"), (table) => {
        provider = new RecordingProvider(table, async () => {
          throw new Error("provider failed");
        });
        return provider;
      })
      .asModule();
    const server = new VuuServer(serverConfig(module), lifecycle);

    await expect(lifecycle.start()).rejects.toThrow("provider failed");
    expect(server.webSocketPort).toBeUndefined();
    expect(provider?.stopCount).toBe(1);
    await lifecycle.destroy();
  });

  test("stops providers in reverse registration order", async () => {
    const stops: string[] = [];
    const lifecycle = new LifecycleContainer();
    const module = ModuleFactory.withNameSpace("LIFECYCLE_REVERSE")
      .addTable(
        tableDef("first"),
        (table) => new RecordingProvider(table, async () => {}, stops),
      )
      .addTable(
        tableDef("second"),
        (table) => new RecordingProvider(table, async () => {}, stops),
      )
      .asModule();
    const server = new VuuServer(serverConfig(module), lifecycle);

    await lifecycle.start();
    await lifecycle.destroy();

    expect(stops).toEqual(["second", "first"]);
  });

  test("creates independent null providers for session tables", () => {
    const lifecycle = new LifecycleContainer();
    const module = ModuleFactory.withNameSpace("NULL_PROVIDER_IDENTITY")
      .addSessionTable(tableDef("session-one"))
      .addSessionTable(tableDef("session-two"))
      .asModule();
    const server = new VuuServer(serverConfig(module), lifecycle);

    const first = server.providers.getProviderForTable("session-one");
    const second = server.providers.getProviderForTable("session-two");
    expect(first).toBeInstanceOf(NullProvider);
    expect(second).toBeInstanceOf(NullProvider);
    expect(first).not.toBe(second);
  });

  test("RemoteProvider does not block startup while its remote service is unavailable", async () => {
    const sockets: TestRemoteResourceSocket[] = [];
    let provider: TestRemoteProvider | undefined;
    const lifecycle = new LifecycleContainer();
    const module = ModuleFactory.withNameSpace("REMOTE_PROVIDER_RESILIENT")
      .addTable(tableDef("remote"), (table) => {
        provider = new TestRemoteProvider(table, sockets);
        return provider;
      })
      .asModule();
    const server = new VuuServer(serverConfig(module), lifecycle);

    await lifecycle.start();
    expect(provider?.loaded).toBe(false);
    const firstLoad = provider?.load(server.tableContainer);
    expect(firstLoad).toBe(provider?.load(server.tableContainer));
    expect(sockets.length).toBe(1);

    // remote service unavailable, then comes online
    sockets[0].emitClose();
    await waitFor(() => sockets.length === 2);
    sockets[1].emitOpen();
    expect(JSON.parse(sockets[1].sent[0])).toEqual({
      type: "subscribe",
      resource: "remote",
      columns: ["id"],
    });
    sockets[1].emitMessage({
      type: "snapshot-batch",
      isLast: true,
      rows: [["a"], ["b"]],
    });
    sockets[1].emitMessage({ type: "snapshot-count", count: 2 });
    expect(provider?.loaded).toBe(true);
    sockets[1].emitMessage({ type: "updates", rows: [["c"]] });
    expect(provider?.table.rowCount).toBe(3);

    await lifecycle.destroy();
    expect(provider?.subscription?.status).toBe("stopped");
    expect(sockets[1].closeCount).toBe(1);
  });

  test("RemoteProvider can wait for initial snapshot, cancelled on shutdown", async () => {
    const sockets: TestRemoteResourceSocket[] = [];
    let provider: TestRemoteProvider | undefined;
    const lifecycle = new LifecycleContainer();
    const module = ModuleFactory.withNameSpace("REMOTE_PROVIDER_CANCELLATION")
      .addTable(tableDef("remote-cancellation"), (table) => {
        provider = new TestRemoteProvider(table, sockets, {
          waitForInitialSnapshot: true,
        });
        return provider;
      })
      .asModule();
    const server = new VuuServer(serverConfig(module), lifecycle);

    const startup = lifecycle.start();
    await Bun.sleep(1);
    const shutdown = lifecycle.destroy();
    const [startupResult, shutdownResult] = await Promise.allSettled([
      startup,
      shutdown,
    ]);
    expect(startupResult.status).toBe("rejected");
    expect(shutdownResult.status).toBe("fulfilled");
    expect(provider?.subscription?.status).toBe("stopped");
    expect(server.webSocketPort).toBeUndefined();
  });

  test("RemoteProvider maps legacy snapshot-only message type to snapshot mode", async () => {
    const sockets: TestRemoteResourceSocket[] = [];
    const table = new Table({
      schema: {
        columns: [{ name: "id", serverDataType: "string" }],
        key: "id",
        table: { module: "TEST", table: "remote" },
      },
    });
    const provider = new TestRemoteProvider(table, sockets, {
      remoteResourceMessageType: ["snapshot"],
    });
    provider.load({} as never);
    sockets[0].emitOpen();
    expect(JSON.parse(sockets[0].sent[0]).type).toBe("snapshot");
    provider.doStop();
  });
});

const waitFor = async (predicate: () => boolean, timeout = 2000) => {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeout) {
      throw Error("timed out waiting for condition");
    }
    await Bun.sleep(5);
  }
};

class RecordingProvider extends Provider {
  loadCount = 0;
  stopCount = 0;

  constructor(
    table: Table,
    private readonly loader: () => Promise<void>,
    private readonly stops?: string[],
  ) {
    super(table);
  }

  async load() {
    this.loadCount += 1;
    await this.loader();
  }

  doStop() {
    this.stopCount += 1;
    this.stops?.push(this.table.name);
  }
}

class TestRemoteProvider extends RemoteProvider {
  constructor(
    table: Table,
    sockets: TestRemoteResourceSocket[],
    private readonly details: Partial<RemoteServiceDetails> = {},
  ) {
    super(
      table,
      (options) =>
        new RemoteTableSubscription({
          ...options,
          log: () => undefined,
          reconnect: { initialDelay: 5, maxDelay: 20 },
          socketFactory: () => {
            const socket = new TestRemoteResourceSocket();
            sockets.push(socket);
            return socket;
          },
        }),
    );
  }

  remoteServiceDetails() {
    return {
      columns: ["id"],
      resource: "remote",
      url: "ws://unused",
      ...this.details,
    };
  }
}
