import {
  ConfigFactory,
  createConfiguredAuthProviders,
  createVuuServerApplication,
  type VuuServerApplication,
  type VuuServerApplicationOptions,
} from "@heswell/vuu-server";
import { createModuleRegistry } from "./ModuleRegistry";
import {
  loadModuleAdminRole,
  loadModuleState,
  ModuleDiscoveryModule,
} from "./modules/ModuleDiscovery/ModuleDiscoveryModule";

export const PORTAL_DEFAULT_HTTPS_PORT = 8443;
export const PORTAL_DEFAULT_WEBSOCKET_PATH = "/websocket-portal";
export const PORTAL_DEFAULT_WEBSOCKET_PORT = 8091;

export type PortalApplicationOptions = Partial<VuuServerApplicationOptions>;

/**
 * Creates (but does not start) a portal server: a Vuu server hosting the
 * MODULE_DISCOVERY module, whose login response carries the user's module
 * registry. Every option overrides the portal default; `modules` are hosted
 * alongside MODULE_DISCOVERY. `config` defaults to `ConfigFactory.load()`.
 */
export function createPortalApplication({
  config = ConfigFactory.load(),
  modules = [],
  ...options
}: PortalApplicationOptions = {}): VuuServerApplication {
  return createVuuServerApplication({
    defaultHttpsPort: PORTAL_DEFAULT_HTTPS_PORT,
    defaultWebSocketPath: PORTAL_DEFAULT_WEBSOCKET_PATH,
    defaultWebSocketPort: PORTAL_DEFAULT_WEBSOCKET_PORT,
    loginSuccessProvider: (user, tableContainer) => ({
      moduleRegistry: createModuleRegistry(tableContainer, user),
    }),
    ...options,
    authProviders:
      options.authProviders ?? createConfiguredAuthProviders(config),
    config,
    modules: [
      ModuleDiscoveryModule(loadModuleState(config), {
        adminRole: loadModuleAdminRole(config),
      }),
      ...modules,
    ],
  });
}
