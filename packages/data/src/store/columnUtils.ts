import { TableColumn } from "@heswell/server-types";
import { ColumnMap } from "@vuu-ui/utils";
import {
  BIN_FILTER_DATA_COLUMNS,
  SET_FILTER_DATA_COLUMNS,
  functor,
  overrideColName,
} from "./filter.js";
import { Row } from "./storeTypes.js";

type ColumnDescriptor = string | { name: string; key?: number };

export const setFilterColumnMeta = metaData(SET_FILTER_DATA_COLUMNS);
export const binFilterColumnMeta = metaData(BIN_FILTER_DATA_COLUMNS);

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

export type RowProjector = (row: Row, index: number) => Row;
export type RowProjectorFactory = (
  startIdx: number,
  offset: number,
  selectedRows: number[]
) => RowProjector;

export const projectColumns = (
  map: ColumnMap,
  columns: TableColumn[],
  meta: ColumnMetaData
): RowProjectorFactory => {
  const length = columns.length;
  const { IDX, RENDER_IDX, DEPTH, COUNT, KEY, SELECTED } = meta;
  return (startIdx: number, offset: number, selectedRows: number[] = []) =>
    (row: Row, i: number) => {
      // selectedRows are indices of rows within underlying dataset (not sorted or filtered)
      // row is the original row from this set, with original index in IDX pos, which might
      // be overwritten with a different value below if rows are sorted/filtered
      const baseRowIdx = row[IDX] as number;

      const out = [];
      for (let i = 0; i < length; i++) {
        const colIdx = map[columns[i].name];
        out[i] = row[colIdx];
      }

      out[IDX] = startIdx + i + offset;
      out[RENDER_IDX] = 0;
      out[DEPTH] = 0;
      out[COUNT] = 0;
      // assume row[0] is key for now
      out[KEY] = row[0];
      out[SELECTED] = selectedRows.includes(baseRowIdx) ? 1 : 0;
      return out;
    };
};

export function projectColumnsFilter(
  map: ColumnMap,
  columns: TableColumn[],
  meta: ColumnMetaData,
  filter: any
) {
  const length = columns.length;
  const { IDX, RENDER_IDX, DEPTH, COUNT, KEY, SELECTED } = meta;

  // this is filterset specific where first col is always value
  const fn = filter
    ? functor(map, overrideColName(filter, "name"))
    : () => true;
  return (startIdx: number) => (row: any[], i: number) => {
    const out = [];
    for (let i = 0; i < length; i++) {
      const colIdx = map[columns[i].name];
      out[i] = row[colIdx];
    }
    // assume row[0] is key for now
    // out.push(startIdx+i, 0, 0, row[0]);
    out[IDX] = startIdx + i;
    out[RENDER_IDX] = 0;
    out[DEPTH] = 0;
    out[COUNT] = 0;
    out[KEY] = row[0];
    out[SELECTED] = fn(row) ? 1 : 0;

    return out;
  };
}

export function getFilterType(column: TableColumn) {
  return column.filter || getDataType(column);
}

// {name: 'Price', 'type': {name: 'price'}, 'aggregate': 'avg'},
// {name: 'MarketCap', 'type': {name: 'number','format': 'currency'}, 'aggregate': 'sum'},

export function getDataType({ type }: TableColumn) {
  if (type === undefined) {
    return "set";
  } else if (typeof type === "string") {
    return type;
  } else {
    switch (type.name) {
      case "price":
        return "number";
      default:
        return type.name;
    }
  }
}

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
