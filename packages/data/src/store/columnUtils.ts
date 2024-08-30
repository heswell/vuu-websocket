import { TableColumn } from "@heswell/server-types";
import { ColumnMap } from "@vuu-ui/vuu-utils";
import { SET_FILTER_DATA_COLUMNS } from "./filter.ts";
import { TableIndex } from "./table.ts";
import {
  VuuDataRow,
  VuuRow,
  VuuRowDataItemType,
} from "@vuu-ui/vuu-protocol-types";

type ColumnDescriptor = string | { name: string; key?: number };

export const setFilterColumnMeta = metaData(SET_FILTER_DATA_COLUMNS);

export const toKeyedColumn = (column: ColumnDescriptor, key: number) =>
  typeof column === "string"
    ? { key, name: column }
    : typeof column.key === "number"
    ? column
    : { ...column, key };

export const toColumn = (column: string | TableColumn): TableColumn =>
  typeof column === "string" ? { name: column } : column;

export function buildColumnMap(columns: ColumnDescriptor[]) {
  return columns.reduce<ColumnMap>((map, column, i) => {
    if (typeof column === "string") {
      map[column] = i;
    } else if (typeof column.key === "number") {
      map[column.name] = column.key;
    } else {
      map[column.name] = i;
    }
    return map;
  }, {});
}

export type VuuDataRowWithMetaData = [
  ...VuuRowDataItemType[],
  number, // IDX
  number, // RENDER_IDX
  number, // DEPTH
  number, // COUNT
  string, // KEY
  number, // SELECTED
  number, // PARENT_IDX
  number, // IDX_POINTER
  number, // FILTER_COUNT
  number, // NEXT_FILTER_IDX
  number // count
];

export type RowProjector = (row: VuuDataRow, rowIndex: number) => VuuRow;
export type MultiRowProjectorFactory = (
  selectedKeyValues: string[],
  index: TableIndex,
  vpSize: number
) => RowProjector;

export const projectColumns = (
  keyFieldIndex: number,
  viewPortId: string
): MultiRowProjectorFactory => {
  return (selected: string[] = [], index: TableIndex, vpSize: number) =>
    (data: VuuDataRow, rowIndex: number) => {
      const rowKey = data[keyFieldIndex] as string;
      return {
        rowIndex,
        rowKey,
        sel: selected.includes(rowKey) ? 1 : 0,
        ts: +new Date(),
        updateType: "U",
        viewPortId,
        vpSize,
        vpVersion: "",
        data,
      } as VuuRow;
    };
};

export const projectColumn = (
  keyFieldIndex: number,
  viewPortId: string,
  selected: string[],
  index: TableIndex,
  vpSize: number
): RowProjector => {
  return (data: VuuDataRow) => {
    const rowKey = data[keyFieldIndex] as string;
    return {
      rowIndex: index.get(rowKey) as number,
      rowKey,
      sel: selected.includes(rowKey) ? 1 : 0,
      ts: +new Date(),
      updateType: "U",
      viewPortId,
      vpSize,
      vpVersion: "",
      data,
    } as VuuRow;
  };
};

export type ColumnMetaData = {
  IDX: number;
  RENDER_IDX: number;
  DEPTH: number;
  COUNT: number;
  KEY: number;
  SELECTED: number;
  PARENT_IDX: number;
  IDX_POINTER: number;
  FILTER_COUNT: number;
  NEXT_FILTER_IDX: number;
  count: number;
};

//TODO cache result by length
export function metaData(columns: any[]): ColumnMetaData {
  const start =
    columns.length === 0
      ? -1
      : Math.max(
          ...columns.map((column, idx) =>
            typeof column.key === "number" ? column.key : idx
          )
        );
  return {
    IDX: start + 1,
    RENDER_IDX: start + 2,
    DEPTH: start + 3,
    COUNT: start + 4,
    KEY: start + 5,
    SELECTED: start + 6,
    PARENT_IDX: start + 7,
    IDX_POINTER: start + 8,
    FILTER_COUNT: start + 9,
    NEXT_FILTER_IDX: start + 10,
    count: start + 11,
  };
}
