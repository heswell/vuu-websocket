import { afterEach, describe, expect, test } from "bun:test";
import {
  bunRuntime,
  getServerRuntime,
  loadServerRuntime,
  setServerRuntime,
  type ServerRuntime,
} from "../src";
import { describeServerRuntime } from "./runtime/serverRuntimeContract";

describeServerRuntime(bunRuntime);

describe("runtime selection", () => {
  afterEach(() => setServerRuntime(undefined));

  test("defaults to Bun under Bun", async () => {
    expect(getServerRuntime()).toBe(bunRuntime);
    expect(await loadServerRuntime()).toBe(bunRuntime);
  });

  test("a runtime set with setServerRuntime wins", async () => {
    const custom = { ...bunRuntime, name: "custom" } satisfies ServerRuntime;
    setServerRuntime(custom);
    expect(getServerRuntime()).toBe(custom);
    expect(await loadServerRuntime()).toBe(custom);
  });
});
