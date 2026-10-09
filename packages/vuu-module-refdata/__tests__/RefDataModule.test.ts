import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  LifecycleContainer,
  LoginTokenService,
  VuuServer,
  VuuServerConfig,
  VuuWebSocketOptions,
} from "@heswell/vuu-server";
import { start } from "@heswell/equity-refdata-service";
import { equityColumns } from "@heswell/equity-refdata-service/schema";
import { RefDataModule, equities } from "../src";

const FIXTURE = path.resolve(
  import.meta.dir,
  "../../equity-refdata-service/__tests__/fixtures/equities.ndjson",
);
const quiet = () => undefined;

const freePort = () => {
  const server = Bun.serve({ fetch: () => new Response(), port: 0 });
  const { port } = server;
  server.stop(true);
  return port;
};

const waitFor = async (predicate: () => boolean, timeout = 5000) => {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeout) {
      throw Error("timed out");
    }
    await Bun.sleep(10);
  }
};

describe("RefDataModule", () => {
  test("equities table mirrors the equity refdata service schema", () => {
    expect(equities.name).toBe("equities");
    expect(equities.keyField).toBe("ric");
    expect(equities.columns.map(({ name, dataType }) => [name, dataType])).toEqual(
      equityColumns.map(({ name, serverDataType }) => [name, serverDataType]),
    );
  });

  test("Vuu server starts before the equity service, table fills once it is online", async () => {
    const port = freePort();
    const module = RefDataModule({
      equitiesUrl: `ws://localhost:${port}`,
      namespace: "REFDATA_TEST",
    });
    const lifecycle = new LifecycleContainer();
    const server = new VuuServer(
      VuuServerConfig(
        VuuWebSocketOptions().withWsPort(0),
        {},
        LoginTokenService(),
      ).withModule(module),
      lifecycle,
    );
    await lifecycle.start();
    const table = server.tableContainer.getTable("equities");
    // first connection attempt fails, the service is not yet running
    await Bun.sleep(100);
    expect(table.rowCount).toBe(0);

    const { loaded, service } = start({ dataPath: FIXTURE, log: quiet, port });
    try {
      await loaded;
      await waitFor(() => table.rowCount === 2);
      const row = table.getRowAtKey("SAP.DE");
      expect(row[table.columnMap.issuerName]).toBe("SAP SE");
    } finally {
      await lifecycle.destroy();
      await service.stop();
    }
  });
});
