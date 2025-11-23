import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import { IEventEmitter } from "@vuu-ui/vuu-utils";

export type DataStoreEvents = {
  insert: (row: VuuDataRow) => void;
};

export interface IDataStore extends IEventEmitter<DataStoreEvents> {
  count: number;
  getRows: (from: number, to: number, columns: string[]) => VuuDataRow[];
  getSnapshot: (resourceName: string) => VuuDataRow[];
}
