import { ColumnMap } from "@vuu-ui/vuu-utils";
import { SET_FILTER_DATA_COLUMNS } from "./filter.ts";
import {
  VuuDataRow,
  VuuRow,
  VuuRowDataItemType,
} from "@vuu-ui/vuu-protocol-types";
import { TableColumn } from "@heswell/vuu-server";

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

export type GroupRowProjector = (
  row: VuuDataRowWithMetaData,
  rowIndex: number
) => VuuRow;
export type RowProjector = (row: VuuDataRow, rowIndex: number) => VuuRow;
export type MultiRowProjectorFactory = (
  selectedKeyValues: Set<string>,
  vpSize: number
) => RowProjector;

export function projectColumns(
  keyFieldIndex: number,
  viewPortId: string
): MultiRowProjectorFactory;
export function projectColumns(
  keyFieldIndex: number,
  viewPortId: string,
  columns: string[],
  columnMap: ColumnMap
): MultiRowProjectorFactory;
export function projectColumns(
  keyFieldIndex: number,
  viewPortId: string,
  columns?: string[],
  columnMap?: ColumnMap
): MultiRowProjectorFactory {
  console.log({
    columns: columns?.join(","),
    columnMap: JSON.stringify(columnMap),
  });

  if (columns === undefined && columnMap === undefined) {
    return (selected: Set<string>, vpSize: number) =>
      (data: VuuDataRow, rowIndex: number) => {
        const rowKey = data[keyFieldIndex] as string;
        return {
          rowIndex,
          rowKey,
          sel: selected.has(rowKey) ? 1 : 0,
          ts: +new Date(),
          updateType: "U",
          viewPortId,
          vpSize,
          vpVersion: "",
          data,
        } as VuuRow;
      };
  } else if (columns && columnMap) {
    const projectRowData = (data: VuuDataRow) => {
      return columns.map((col) => data[columnMap[col]]);
    };
    return (selected: Set<string>, vpSize: number) =>
      (data: VuuDataRow, rowIndex: number) => {
        const rowKey = data[keyFieldIndex] as string;
        return {
          rowIndex,
          rowKey,
          sel: selected.has(rowKey) ? 1 : 0,
          ts: +new Date(),
          updateType: "U",
          viewPortId,
          vpSize,
          vpVersion: "",
          data: projectRowData(data),
        } as VuuRow;
      };
  } else {
    throw Error(
      "[columnUtils] projectColumns, if either columns or columnMap are provided, both must be provided"
    );
  }
}

export const projectColumn = (
  keyFieldIndex: number,
  viewPortId: string,
  selected: Set<string>,
  vpSize: number
): RowProjector => {
  return (data: VuuDataRow, rowIndex: number) => {
    const rowKey = data[keyFieldIndex] as string;
    return {
      rowIndex,
      rowKey,
      sel: selected.has(rowKey) ? 1 : 0,
      ts: +new Date(),
      updateType: "U",
      viewPortId,
      vpSize,
      vpVersion: "",
      data,
    } as VuuRow;
  };
};

export const projectGroupColumn = (
  viewPortId: string,
  columnMeta: ColumnMetaData,
  selected: string[],
  vpSize: number
): GroupRowProjector => {
  return (data: VuuDataRowWithMetaData, rowIndex: number) => {
    const rowKey = data[columnMeta.KEY] as string;
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
  columnCount: number;
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
    columnCount: start + 1,
    count: start + 11,
  };
}
