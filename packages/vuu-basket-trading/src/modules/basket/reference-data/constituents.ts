import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import constituents from "./constituents.json";
import { basketConstituent } from "../BasketTableDefs";

export default constituents.map((constituent): VuuDataRow => {
  const values: Record<string, string | number> = constituent;
  return basketConstituent.columns.map(({ name }) => values[name]);
});
