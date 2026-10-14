import type {
  DataSourceConfig,
  DataSourceConstructorProps,
  SessionDataSourceOverrides,
  ServerAPI,
} from "@vuu-ui/vuu-data-types";
import { DataProvider as CoreDataProvider } from "@vuu-ui/core";
import { DataProvider as LegacyDataProvider } from "@vuu-ui/vuu-utils";
import type { ReactNode } from "react";
import type { LocalEngine } from "../core/engine/LocalEngine";

const providers = new WeakMap<
  LocalEngine,
  ({ children }: { children: ReactNode }) => ReactNode
>();

/**
 * Creates a Provider that installs both legacy and core data contexts,
 * backed by the VuuModules registered with `engine`. Modules are resolved
 * when used, so modules registered later are visible too.
 */
export const createDataSourceProvider = (engine: LocalEngine) => {
  const cached = providers.get(engine);
  if (cached) {
    return cached;
  }
  const getModule = (moduleName: string) => {
    if (!engine.hasModule(moduleName)) {
      throw Error(
        `[LocalDataSourceProvider] module ${moduleName} is not available on this server`,
      );
    }
    return engine.getModule(moduleName);
  };

  const serverAPI: Pick<
    ServerAPI,
    "getTableList" | "getTableSchema" | "rpcCall"
  > = {
    getTableList: async () => ({ tables: engine.getTableList() }),
    getTableSchema: async ({ module, table }) =>
      getModule(module).getTableSchema(table),
    rpcCall: async () => {
      throw Error(
        "RpcCall no longer supported on LocalDataSourceProvider ServerAPI",
      );
    },
  };

  const getServerAPI = async () => serverAPI;

  class VuuDataSource {
    constructor({
      aggregations,
      columns,
      filterSpec,
      groupBy,
      session,
      sort,
      table,
      viewport,
      visualLink,
    }: DataSourceConstructorProps) {
      const config: DataSourceConfig & {
        session?: SessionDataSourceOverrides;
      } = {
        aggregations,
        columns,
        filterSpec,
        groupBy,
        session,
        sort,
        visualLink,
      };

      const module = getModule(table.module);
      // biome-ignore lint/correctness/noConstructorReturn: <This 'class' is acting as a factory for new local DataSources>
      return module.createDataSource(table.table, viewport, config);
    }
  }

  const DataSourceProvider = ({ children }: { children: ReactNode }) => {
    return (
      <LegacyDataProvider
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        VuuDataSource={VuuDataSource as any}
        getServerAPI={getServerAPI}
      >
        <CoreDataProvider
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          VuuDataSource={VuuDataSource as any}
          getServerAPI={getServerAPI}
        >
          {children}
        </CoreDataProvider>
      </LegacyDataProvider>
    );
  };

  providers.set(engine, DataSourceProvider);
  return DataSourceProvider;
};
