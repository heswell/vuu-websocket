export interface RemoteModuleConnection {
  connectionId: string;
  restUrl?: string;
  websocketUrl?: string;
}

/**
 * A portal module as sent in LOGIN_SUCCESS. Mirrors the UI's
 * `VuuModuleDescriptor` (`@vuu-ui/vuu-protocol-types`).
 */
export interface ModuleRecord {
  /** The module's own client, also the UI's key for its saved state. */
  clientIdentifier: string;
  id: number;
  accessRole: string;
  name: string;
  title: string;
  description: string;
  version: number;
  enabled: boolean;
  /**
   * Navigation entry, e.g. `/Trading/Baskets`. Empty for a nested module,
   * which is rendered from within another module rather than navigated to.
   */
  navLocation: string;
  navIconName?: string;
  navIconUrl?: string;
  path: string;
  mfComponent: string;
  mfScope: string;
  mfUrl: string;
  vuu?: RemoteModuleConnection;
}

export interface ModuleRegistry {
  modules: ModuleRecord[];
}

export interface LoginSuccessOptions {
  moduleRegistry?: ModuleRegistry;
}
