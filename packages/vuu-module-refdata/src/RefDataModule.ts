import { ConfigFactory, ModuleFactory } from "@heswell/vuu-server";
import { RemoteResourceProvider } from "./RemoteResourceProvider";
import { equities } from "./tableDefs";

export interface RefDataModuleOptions {
  /**
   * websocket url of the equity refdata service. Defaults to the
   * services.equities.url configuration value.
   */
  equitiesUrl?: string;
  /** Defaults to REFDATA */
  namespace?: string;
}

export const DEFAULT_EQUITIES_URL_CONFIG = "services.equities.url";

/**
 * Reference data tables, populated from remote data services. Services
 * may be started before or after the Vuu server, tables are populated
 * once the service becomes available.
 */
export const RefDataModule = ({
  equitiesUrl,
  namespace = "REFDATA",
}: RefDataModuleOptions = {}) =>
  ModuleFactory.withNameSpace(namespace)
    .addTable(
      equities,
      (table) =>
        new RemoteResourceProvider(
          table,
          "equities",
          () =>
            equitiesUrl ??
            ConfigFactory.load().getString(DEFAULT_EQUITIES_URL_CONFIG),
        ),
    )
    .asModule();
