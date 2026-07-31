import { describe, expect, test } from "bun:test";
import { Table } from "@heswell/data";
import { loadTableFromRemoteResource } from "../../service-utils/src/resource-loader";
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
  RemoteResourceLoad,
  RemoteProvider,
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

  test("reuses a RemoteProvider load promise and aborts its resource on shutdown", async () => {
    const resourceLoad = Promise.withResolvers<number>();
    let resourceSignal: AbortSignal | undefined;
    let provider: TestRemoteProvider | undefined;
    const lifecycle = new LifecycleContainer();
    const module = ModuleFactory.withNameSpace("REMOTE_PROVIDER_RESOURCE")
      .addTable(tableDef("remote"), (table) => {
        provider = new TestRemoteProvider(table, ({ signal }) => {
          resourceSignal = signal;
          return resourceLoad.promise;
        });
        return provider;
      })
      .asModule();
    const server = new VuuServer(serverConfig(module), lifecycle);

    const startup = lifecycle.start();
    await Bun.sleep(1);
    const firstLoad = provider?.load(server.tableContainer);
    const secondLoad = provider?.load(server.tableContainer);
    expect(firstLoad).toBe(secondLoad);

    resourceLoad.resolve(1);
    await startup;
    expect(resourceSignal?.aborted).toBe(false);
    await lifecycle.destroy();
    expect(resourceSignal?.aborted).toBe(true);
  });

  test("cancels a remote provider that is still loading during shutdown", async () => {
    let resourceSignal: AbortSignal | undefined;
    let provider: TestRemoteProvider | undefined;
    const lifecycle = new LifecycleContainer();
    const module = ModuleFactory.withNameSpace("REMOTE_PROVIDER_CANCELLATION")
      .addTable(tableDef("remote-cancellation"), (table) => {
        provider = new TestRemoteProvider(table, ({ signal }) => {
          resourceSignal = signal;
          return new Promise<number>((_, reject) => {
            signal?.addEventListener(
              "abort",
              () => reject(new Error("resource aborted")),
              { once: true },
            );
          });
        });
        return provider;
      })
      .asModule();
    const server = new VuuServer(serverConfig(module), lifecycle);

    const startup = lifecycle.start();
    await Bun.sleep(1);
    const firstLoad = provider?.load(server.tableContainer);
    const secondLoad = provider?.load(server.tableContainer);
    expect(firstLoad).toBe(secondLoad);

    const shutdown = lifecycle.destroy();
    const [startupResult, shutdownResult] = await Promise.allSettled([
      startup,
      shutdown,
    ]);
    expect(startupResult.status).toBe("rejected");
    expect(shutdownResult.status).toBe("fulfilled");
    expect(resourceSignal?.aborted).toBe(true);
    expect(server.webSocketPort).toBeUndefined();

    const preAborted = new AbortController();
    preAborted.abort();
    await expect(
      loadTableFromRemoteResource({
        resource: "remote-cancellation",
        signal: preAborted.signal,
        table: server.tableContainer.getTable("remote-cancellation"),
        url: "ws://unused",
      }),
    ).rejects.toThrow("aborted remote-cancellation");
  });
});

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
  constructor(table: Table, loader: RemoteResourceLoad) {
    super(table, loader);
  }

  remoteServiceDetails() {
    return {
      columns: ["id"],
      resource: "remote",
      url: "ws://unused",
    };
  }
}
