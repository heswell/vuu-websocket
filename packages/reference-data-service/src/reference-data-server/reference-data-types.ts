import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

export interface RowCount {
  count: number;
}

export interface Instruments {
  instruments: VuuDataRow[];
}

export type ReferenceData = Instruments;
