import { describe, expect, test } from "bun:test";
import path from "node:path";
import { RemoteTableSubscription } from "@heswell/service-utils";
import { Table } from "@heswell/vuu-table";
import { equitiesSchema, start } from "../src";

const FIXTURE = path.resolve(import.meta.dir, "fixtures/equities.ndjson");
const quiet = () => undefined;

describe("equity refdata service", () => {
  test("loads ndjson rows by column name, skipping invalid lines", async () => {
    const messages: string[] = [];
    const { equities, loaded, service } = start({
      dataPath: FIXTURE,
      log: (message) => messages.push(message),
      port: 0,
    });
    try {
      expect(await loaded).toBe(2);
      expect(messages.some((m) => m.includes("1 invalid records skipped"))).toBe(true);
      const row = equities.getRowAtKey("ASML.AS");
      const value = (name: string) => row[equities.columnMap[name]];
      expect(value("isin")).toBe("NL0010273215");
      expect(value("liquid")).toBe(true);
      expect(value("tickSizeBand")).toBe(6);
      expect(value("parentName")).toBeNull();
    } finally {
      await service.stop();
    }
  });

  test("subscribers receive the equities snapshot", async () => {
    const { loaded, service } = start({ dataPath: FIXTURE, log: quiet, port: 0 });
    const subscription = new RemoteTableSubscription({
      log: quiet,
      resource: "equities",
      table: new Table({ schema: equitiesSchema }),
      url: service.url,
    });
    try {
      await loaded;
      subscription.start();
      expect(await subscription.firstSnapshot).toBe(2);
    } finally {
      subscription.stop();
      await service.stop();
    }
  });
});
