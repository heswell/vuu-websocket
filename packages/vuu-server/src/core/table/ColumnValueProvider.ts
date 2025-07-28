import { SortSet, Table } from "@heswell/data";
import { Column } from "../../api/TableDef";
import { VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import { DataTable, isDataTable } from "./InMemDataTable";

const isSortSet = (vpKeys: SortSet | number[]): vpKeys is SortSet =>
  Array.isArray(vpKeys[0]);

export class ColumnValueProvider {
  constructor(private table: Table) {}

  getUniqueValuesVPColumn(
    column: string,
    vpColumns: Column[],
    vpKeys: number[] | SortSet
  ) {
    const table = this.table;
    const columnIndex = vpColumns.findIndex((col) => col.name === column);
    if (isDataTable(table)) {
      return getFirstUniqueValuesFromVpKeys(vpKeys, table, columnIndex);
    } else {
      throw Error(
        "[ColumnValueProvider] getUniqueValuesVPColumn, table must be instance of DataTable"
      );
    }
  }
}

const MAX = "ZZZZZZZZZZZZZZZZ";

function binarySearch<T = VuuRowDataItemType>(items: T[], item: T) {
  let l = 0;
  let h = items.length - 1;
  let m;

  while (l <= h) {
    m = (l + h) >>> 1; /* equivalent to Math.floor((l + h) / 2) but faster */
    if (items[m] < item) {
      l = m + 1;
    } else if (items[m] > item) {
      h = m - 1;
    } else {
      return m;
    }
  }
  return ~l;
}

function binaryInsert(
  values: VuuRowDataItemType[],
  value: VuuRowDataItemType,
  n: number
) {
  var i = binarySearch(values, value);
  /* if the binarySearch return value was zero or positive, a matching object was found */
  /* if the return value was negative, the bitwise complement of the return value is the correct index for this object */
  if (i < 0) {
    values.splice(~i, 0, value);
    values.length = n;
    return true;
  } else {
    return false;
  }
}

function getFirstUniqueValuesFromVpKeys(
  vpKeys: SortSet | number[],
  table: DataTable,
  columnIndex: number,
  n = 10
) {
  const head = new Array(n).fill(MAX);
  const len = vpKeys.length;
  let gateKeeper = head.at(-1);

  if (isSortSet(vpKeys)) {
    for (let i = 0; i < len; i++) {
      const value = table.rows[vpKeys[i][0]][columnIndex];
      if (value < gateKeeper) {
        if (binaryInsert(head, value, n)) {
          gateKeeper = head.at(-1);
        }
      }
    }
  } else {
    for (let i = 0; i < len; i++) {
      const value = table.rows[vpKeys[i]][columnIndex];
      if (value < gateKeeper) {
        if (binaryInsert(head, value, n)) {
          gateKeeper = head.at(-1);
        }
      }
    }
  }
  return head.filter((val) => val !== MAX);
}
