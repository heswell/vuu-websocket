import {
  type Config,
  ConfigFactory,
  createConfiguredAuthProviders,
  createVuuServerApplication,
  getLogger,
  type VuuServerApplication,
} from "@heswell/vuu-server";
import { createModuleRegistry } from "./ModuleRegistry";
import {
  loadModuleAdminRole,
  loadModuleState,
  ModuleDiscoveryModule,
} from "./modules/ModuleDiscovery/ModuleDiscoveryModule";
import { resolvePortalConfig } from "./resolvePortalConfig";

const log = getLogger("vuu.portal");

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
   * directory. Defaults to $VUU_CONFIG_FILE, then $VUU_APP
   * (packages/<app>/application.conf), then ./application.conf, then the
   * conf bundled with the package (see resolvePortalConfig).
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
  const portalConfig = config ?? loadPortalConfig(configFile);
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

function loadPortalConfig(configFile?: string) {
  const resolved = resolvePortalConfig({ configFile });
  const config = ConfigFactory.load(resolved.configFile, {
    overrides: resolved.overrides,
  });
  log.info(`using ${resolved.configFile} (from ${resolved.source})`);
  if (
    config.getBoolean("vuu.ssl", false) &&
    !(config.has("vuu.certPath") && config.has("vuu.keyPath"))
  ) {
    throw new Error(
      `vuu.ssl=true needs vuu.certPath and vuu.keyPath (set VUU_CERT_PATH and VUU_KEY_PATH, or set them in ${resolved.configFile})`,
    );
  }
  if (resolved.source === "bundled") {
    log.warn(
      `no application.conf given: using the bundled default (vuu.auth.mode=${config.getString("vuu.auth.mode", "")}, vuu.ssl=${config.getBoolean("vuu.ssl", false)}). Pass --config or set VUU_CONFIG_FILE for anything but local development. Module catalogue: ${config.getPath("vuu.portal.modulesFile")}`,
    );
  }
  return config;
}
