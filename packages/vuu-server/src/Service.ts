import { Table } from "@heswell/vuu-table";
import { VuuMenu } from "@vuu-ui/vuu-protocol-types";
import { ProviderContainer } from "./provider/ProviderContainer";
import { ViewPortDef } from "./api/ViewPortDef";
import { getLogger } from "@heswell/service-utils/browser";

const log = getLogger("vuu.service");

export type RpcNamedParams = Record<string, unknown>;

export interface ServiceMessage {
  name: string;
  namedParams: RpcNamedParams;
}

export interface IService {
  getMenu(): VuuMenu | undefined;
  invokeService(message: ServiceMessage): unknown;
}

export abstract class Service implements IService {
  #table: Table;

  constructor(table: Table) {
    this.#table = table;
  }

  getMenu(): VuuMenu | undefined {
    return undefined;
  }

  invokeService(message: ServiceMessage) {
    log.warn(
      `no implementation for service message ${JSON.stringify(message)}`
    );
  }
}
