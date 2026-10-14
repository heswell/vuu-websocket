import { withHappyDom } from "./happy-dom";
import { useData } from "@vuu-ui/core";
import type { ServerAPI } from "@vuu-ui/vuu-data-types";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "bun:test";
import { getDefaultEngine } from "../src/core/engine/LocalEngine";
import {
  createLocalVuuServer,
  LocalDataSourceProvider,
} from "../src/react";
import { SimulModule } from "../src/simul/SimulModule";
import { BasketModule } from "../src/basket/BasketModule";

withHappyDom();

type TestServerAPI = Pick<ServerAPI, "getTableList" | "getTableSchema">;

const captureServerAPI = async (
  Provider: ReturnType<typeof createLocalVuuServer>["DataSourceProvider"],
) => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  let serverAPI: TestServerAPI | undefined;
  const Probe = () => {
    const { getServerAPI } = useData();
    useEffect(() => {
      getServerAPI().then((api) => {
        serverAPI = api as TestServerAPI;
      });
    }, [getServerAPI]);
    return null;
  };
  await act(async () => {
    root.render(
      <Provider>
        <Probe />
      </Provider>,
    );
  });
  act(() => root.unmount());
  if (!serverAPI) {
    throw Error("serverAPI was not provided");
  }
  return serverAPI;
};

describe("createLocalVuuServer", () => {
  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("registers its modules with its own engine", () => {
    const simulModule = new SimulModule();
    const server = createLocalVuuServer({
      connectionId: "simul",
      modules: [simulModule],
    });

    expect(server.engine.hasModule("SIMUL")).toBe(true);
    expect(server.engine.getModule("SIMUL")).toBe(simulModule);
    expect(getDefaultEngine().hasModule("SIMUL")).toBe(false);
    expect(server.connectionId).toBe("simul");
    server.engine.dispose();
  });

  it("publishes only the tables of its own modules", async () => {
    const simulModule = new SimulModule();
    const simul = createLocalVuuServer({
      connectionId: "simul",
      modules: [simulModule],
    });
    const basket = createLocalVuuServer({
      connectionId: "basket",
      modules: [new BasketModule({ prices: simulModule.prices })],
    });

    const serverAPI = await captureServerAPI(simul.DataSourceProvider);
    const { tables } = await serverAPI.getTableList();

    expect(tables.length).toBeGreaterThan(0);
    expect(tables.every(({ module }) => module === "SIMUL")).toBe(true);
    await expect(
      serverAPI.getTableSchema({ module: "SIMUL", table: "instruments" }),
    ).resolves.toMatchObject({
      table: { module: "SIMUL", table: "instruments" },
    });
    await expect(
      serverAPI.getTableSchema({ module: "BASKET", table: "basket" }),
    ).rejects.toThrow("module BASKET is not available on this server");
    simul.engine.dispose();
    basket.engine.dispose();
  });

  it("LocalDataSourceProvider covers the modules of the default engine", async () => {
    const simulModule = new SimulModule();
    const basketModule = new BasketModule({ prices: simulModule.prices });
    const server = createLocalVuuServer({
      connectionId: "all",
      modules: [simulModule, basketModule],
      engine: getDefaultEngine(),
    });
    const serverAPI = await captureServerAPI(LocalDataSourceProvider);
    const { tables } = await serverAPI.getTableList();
    const modules = new Set(tables.map(({ module }) => module));

    expect(modules.has("SIMUL")).toBe(true);
    expect(modules.has("BASKET")).toBe(true);
    server.engine.dispose();
  });
});
