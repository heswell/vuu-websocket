import { ServerToClientTableRows, VuuRow } from "@vuu-ui/vuu-protocol-types";

const NO_SIZE: VuuRow[] = [];

export const tableRowsMessageBody = (
  rows: VuuRow[],
  vpSize: number,
  viewPortId: string,
  includeSize: boolean
) => {
  const ts = +new Date();
  const sizeMessage = includeSize
    ? [
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
      ]
    : NO_SIZE;
  return {
    batch: "REQ-0",
    isLast: true,
    rows: sizeMessage.concat(rows),
    timeStamp: ts,
    type: "TABLE_ROW",
  } as ServerToClientTableRows;
};
