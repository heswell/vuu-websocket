import {
  type Config,
  ConfigFactory,
  createConfiguredAuthProviders,
  createVuuServerApplication,
  type VuuServerApplication,
} from "@heswell/vuu-server";
import { createModuleRegistry } from "./ModuleRegistry";
import {
  loadModuleAdminRole,
  loadModuleState,
  ModuleDiscoveryModule,
} from "./modules/ModuleDiscovery/ModuleDiscoveryModule";

// Fallbacks only, used when application.conf does not set
// vuu.https.port / vuu.websocket.port / vuu.websocket.path.
export const PORTAL_DEFAULT_HTTPS_PORT = 8443;
export const PORTAL_DEFAULT_WEBSOCKET_PATH = "/websocket-portal";
export const PORTAL_DEFAULT_WEBSOCKET_PORT = 8091;

export type PortalApplicationOptions = {
  /** An already loaded config. Takes precedence over `configFile`. */
  config?: Config;
  /**
   * Path to the portal's application.conf, resolved against the current
   * directory. Defaults to ConfigFactory's lookup: $VUU_CONFIG_FILE, then
   * $VUU_APP, then ./application.conf.
   */
  configFile?: string;
};

/**
 * Creates (but does not start) the portal server, configured entirely by
 * application.conf: ports, websocket path, auth, the module catalogue files
 * (vuu.portal.modulesFile / vuu.portal.defaultModulesFile, resolved relative
 * to the conf file) and the module admin role (vuu.portal.moduleAdminRole).
 */
export function createPortalApplication({
  config,
  configFile,
}: PortalApplicationOptions = {}): VuuServerApplication {
  const portalConfig = config ?? ConfigFactory.load(configFile);
  return createVuuServerApplication({
    authProviders: createConfiguredAuthProviders(portalConfig),
    config: portalConfig,
    defaultHttpsPort: PORTAL_DEFAULT_HTTPS_PORT,
    defaultWebSocketPath: PORTAL_DEFAULT_WEBSOCKET_PATH,
    defaultWebSocketPort: PORTAL_DEFAULT_WEBSOCKET_PORT,
    loginSuccessProvider: (user, tableContainer) => ({
      moduleRegistry: createModuleRegistry(tableContainer, user),
    }),
    modules: [
      ModuleDiscoveryModule(loadModuleState(portalConfig), {
        adminRole: loadModuleAdminRole(portalConfig),
      }),
    ],
  });
}
