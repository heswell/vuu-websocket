import type { Table } from "@heswell/vuu-table";
import { RemoteProvider } from "@heswell/vuu-server";

/**
 * Subscribes a table to a resource published by a remote data service. The
 * url is resolved when the table is first loaded, after configuration has
 * been read.
 */
export class RemoteResourceProvider extends RemoteProvider {
  constructor(
    table: Table,
    private readonly resource: string,
    private readonly url: () => string,
  ) {
    super(table);
  }

  remoteServiceDetails() {
    return { resource: this.resource, url: this.url() };
  }
}
