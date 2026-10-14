import type { LocalVuuServer } from "@vuu-ui/core";
import type { ReactNode } from "react";
import {
  type AnyVuuModule,
  getDefaultEngine,
  LocalEngine,
} from "../core/engine/LocalEngine";
import { createDataSourceProvider } from "./createDataSourceProvider";

/**
 * Data context covering every VuuModule registered with the default engine.
 * @deprecated use `engine.DataSourceProvider` (see `createLocalEngine`).
 */
export const LocalDataSourceProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const DataSourceProvider = createDataSourceProvider(getDefaultEngine());
  return <DataSourceProvider>{children}</DataSourceProvider>;
};

export interface LocalVuuServerOptions {
  /** Matches the `vuu.connectionId` of the modules this server serves. */
  connectionId: string;
  modules: AnyVuuModule[];
  /**
   * The engine to register the modules with. Defaults to a new, isolated
   * engine, so each server publishes only its own modules.
   */
  engine?: LocalEngine;
}

/**
 * Simulates a Vuu server in the browser, publishing the tables of the given
 * modules. Pass the result to a local-mode `AuthenticationProvider` as one of
 * its `localServers`. The returned `engine` can be disposed when the server
 * is no longer needed.
 */
export const createLocalVuuServer = ({
  connectionId,
  modules,
  engine = new LocalEngine(),
}: LocalVuuServerOptions): LocalVuuServer & { engine: LocalEngine } => {
  for (const module of modules) {
    engine.register(module);
  }
  return {
    connectionId,
    DataSourceProvider: createDataSourceProvider(engine),
    engine,
  };
};
