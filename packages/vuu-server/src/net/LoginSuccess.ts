export interface RemoteModuleConnection {
  connectionId: string;
  restUrl?: string;
  websocketUrl?: string;
}

export interface ModuleRecord {
  clientIdentifier: string;
  id: number;
  loginRole: string;
  name: string;
  title: string;
  description: string;
  version: number;
  enabled: boolean;
  location: string;
  path: string;
  mfComponent: string;
  mfScope: string;
  mfUrl: string;
  vuu: RemoteModuleConnection;
}

export interface ModuleRegistry {
  modules: ModuleRecord[];
}

export interface LoginSuccessOptions {
  moduleRegistry?: ModuleRegistry;
}
