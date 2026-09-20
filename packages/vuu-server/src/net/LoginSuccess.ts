export interface RemoteModuleConnection {
  connectionId: string;
  restUrl?: string;
  websocketUrl?: string;
}

export interface ModuleRecord {
  clientIdentifier: string;
  id: number;
  accessRole: string;
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
  vuu?: RemoteModuleConnection;
  nestedModules?: NestedModuleRecord[];
}

export interface NestedModuleRecord {
  name: string;
  mfComponent: string;
  mfScope: string;
  mfUrl: string;
}

export interface ModuleRegistry {
  modules: ModuleRecord[];
}

export interface LoginSuccessOptions {
  moduleRegistry?: ModuleRegistry;
}
