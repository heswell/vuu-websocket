import { Table } from "@heswell/data";
import { RpcNamedParams, VuuMenu } from "@vuu-ui/vuu-protocol-types";

export interface ServiceMessage {
  name: string;
  namedParams: RpcNamedParams;
}

export interface IService {
  getMenu(): VuuMenu | undefined;
  invokeService(message: ServiceMessage): unknown;
}

export type ServiceFactory = (table: Table) => IService;

export abstract class Service implements IService {
  #table: Table;

  constructor(table: Table) {
    this.#table = table;
  }

  getMenu(): VuuMenu | undefined {
    return undefined;
  }

  invokeService(message: ServiceMessage) {
    console.log(
      `no implementation for service message ${JSON.stringify(message)}`
    );
  }
}
