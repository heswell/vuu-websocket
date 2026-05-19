import { ValueOf } from "@vuu-ui/vuu-utils";

export const RowUpdateType = {
  SizeOnly: "SIZE",
  Update: "U",
};

export type RowUpdateType = ValueOf<typeof RowUpdateType>;
