import { ServerToClientTableRows, VuuRow } from "@vuu-ui/vuu-protocol-types";

export const tableRowsMessageBody = (
  rows: VuuRow[],
  vpSize: number,
  viewPortId: string
) => {
  const ts = +new Date();
  return {
    batch: "REQ-0",
    isLast: true,
    rows: [
      {
        data: [],
        rowIndex: -1,
        rowKey: "SIZE",
        sel: 0,
        ts,
        updateType: "SIZE",
        viewPortId,
        vpSize,
        vpVersion: "",
      } as VuuRow,
    ].concat(rows),
    timeStamp: ts,
    type: "TABLE_ROW",
  } as ServerToClientTableRows;
};
