import { Table } from "./Table.ts";
import type {
  TableListener,
  TableSchema,
  VuuDataRow,
  VuuRowDataItemType,
} from "./types.ts";

export interface JoinTableConfig {
  /**
   * schema of the join table. Key must be the key of the base table.
   * Column order defines the layout of joined rows.
   */
  schema: TableSchema;
  baseTable: Table;
  joinTable: Table;
  /** column in base table holding the join value */
  leftColumn: string;
  /** column in join (right) table matched against leftColumn */
  rightColumn: string;
}

type ColumnSource = 0 | 1; // 0 = base, 1 = right

const NO_KEYS: ReadonlySet<string> = new Set();

/**
 * Materialized left outer join of two tables. Joined rows are maintained
 * incrementally as either source table changes, so a JoinTable is itself a
 * regular Table that viewports can sort, filter and group with no join cost
 * at query time.
 *
 * Base table columns take precedence when a column name exists in both
 * tables.
 */
export class JoinTable extends Table {
  readonly baseTable: Table;
  readonly joinTable: Table;

  #leftIdx: number;
  #rightIdx: number;
  #rightIsKey: boolean;
  #sources: ColumnSource[];
  #sourceIndices: number[];
  /** join value -> keys of base rows with that join value */
  #baseKeysByJoinValue = new Map<VuuRowDataItemType, Set<string>>();
  /** join value -> key of right row (only when rightColumn is not right key) */
  #rightKeyByJoinValue = new Map<VuuRowDataItemType, string>();

  #baseListener: TableListener;
  #rightListener: TableListener;

  constructor({
    schema,
    baseTable,
    joinTable,
    leftColumn,
    rightColumn,
  }: JoinTableConfig) {
    super(schema);
    this.baseTable = baseTable;
    this.joinTable = joinTable;

    const leftIdx = baseTable.columnMap[leftColumn];
    const rightIdx = joinTable.columnMap[rightColumn];
    if (leftIdx === undefined) {
      throw Error(`[JoinTable] no column ${leftColumn} in ${baseTable.name}`);
    }
    if (rightIdx === undefined) {
      throw Error(`[JoinTable] no column ${rightColumn} in ${joinTable.name}`);
    }
    this.#leftIdx = leftIdx;
    this.#rightIdx = rightIdx;
    this.#rightIsKey = rightIdx === joinTable.indexOfKeyField;

    this.#sources = [];
    this.#sourceIndices = [];
    for (const { name } of schema.columns) {
      const baseIdx = baseTable.columnMap[name];
      if (baseIdx !== undefined) {
        this.#sources.push(0);
        this.#sourceIndices.push(baseIdx);
      } else {
        const joinIdx = joinTable.columnMap[name];
        this.#sources.push(1);
        this.#sourceIndices.push(joinIdx ?? -1);
      }
    }

    if (!this.#rightIsKey) {
      for (const row of joinTable.rows) {
        this.indexRightRow(row);
      }
    }
    for (const row of baseTable.rows) {
      this.indexBaseRow(row);
      super.insert(this.joinRow(row));
    }

    this.#baseListener = {
      onInsert: (_, row) => {
        this.indexBaseRow(row);
        super.insert(this.joinRow(row));
      },
      onUpdate: (_, row, previous) => {
        const key = String(row[baseTable.indexOfKeyField]);
        if (previous !== row) {
          const prevJoinValue = previous[this.#leftIdx];
          if (prevJoinValue !== row[this.#leftIdx]) {
            this.unindexBaseRow(key, prevJoinValue);
            this.indexBaseRow(row);
          }
        }
        this.refresh(key, row);
      },
      onDelete: (_, row) => {
        const key = String(row[baseTable.indexOfKeyField]);
        this.unindexBaseRow(key, row[this.#leftIdx]);
        super.delete(key);
      },
      onClear: () => {
        this.#baseKeysByJoinValue.clear();
        super.clear();
      },
    };

    this.#rightListener = {
      onInsert: (_, row) => {
        if (!this.#rightIsKey) this.indexRightRow(row);
        this.refreshForJoinValue(row[this.#rightIdx]);
      },
      onUpdate: (_, row, previous) => {
        const joinValue = row[this.#rightIdx];
        if (previous !== row && previous[this.#rightIdx] !== joinValue) {
          if (!this.#rightIsKey) {
            this.unindexRightRow(previous);
            this.indexRightRow(row);
          }
          this.refreshForJoinValue(previous[this.#rightIdx]);
        }
        this.refreshForJoinValue(joinValue);
      },
      onDelete: (_, row) => {
        if (!this.#rightIsKey) this.unindexRightRow(row);
        this.refreshForJoinValue(row[this.#rightIdx]);
      },
      onClear: () => {
        this.#rightKeyByJoinValue.clear();
        for (const row of this.baseTable.rows) {
          this.refresh(String(row[this.baseTable.indexOfKeyField]), row);
        }
      },
    };

    baseTable.addListener(this.#baseListener);
    joinTable.addListener(this.#rightListener);
  }

  destroy() {
    this.baseTable.removeListener(this.#baseListener);
    this.joinTable.removeListener(this.#rightListener);
  }

  private findRightRow(joinValue: VuuRowDataItemType) {
    if (joinValue === null || joinValue === undefined) {
      return undefined;
    }
    if (this.#rightIsKey) {
      return this.joinTable.getRowAtKey(String(joinValue), false);
    } else {
      const rightKey = this.#rightKeyByJoinValue.get(joinValue);
      return rightKey === undefined
        ? undefined
        : this.joinTable.getRowAtKey(rightKey, false);
    }
  }

  private joinRow(baseRow: VuuDataRow): VuuDataRow {
    const rightRow = this.findRightRow(baseRow[this.#leftIdx]);
    const sources = this.#sources;
    const indices = this.#sourceIndices;
    const len = sources.length;
    const row: (VuuDataRow[number] | null)[] = new Array(len);
    for (let i = 0; i < len; i++) {
      const idx = indices[i];
      if (sources[i] === 0) {
        row[i] = baseRow[idx];
      } else {
        row[i] = rightRow === undefined || idx === -1 ? null : rightRow[idx];
      }
    }
    return row as VuuDataRow;
  }

  private refresh(key: string, baseRow: VuuDataRow) {
    const rowIdx = this.rowIndexAtKey(key);
    if (rowIdx !== -1) {
      super.update(rowIdx, this.joinRow(baseRow));
    }
  }

  private refreshForJoinValue(joinValue: VuuRowDataItemType) {
    const keys = this.#baseKeysByJoinValue.get(joinValue) ?? NO_KEYS;
    for (const key of keys) {
      const baseRow = this.baseTable.getRowAtKey(key, false);
      if (baseRow) {
        this.refresh(key, baseRow);
      }
    }
  }

  private indexBaseRow(row: VuuDataRow) {
    const joinValue = row[this.#leftIdx];
    const key = String(row[this.baseTable.indexOfKeyField]);
    let keys = this.#baseKeysByJoinValue.get(joinValue);
    if (keys === undefined) {
      this.#baseKeysByJoinValue.set(joinValue, (keys = new Set()));
    }
    keys.add(key);
  }

  private unindexBaseRow(key: string, joinValue: VuuRowDataItemType) {
    const keys = this.#baseKeysByJoinValue.get(joinValue);
    if (keys) {
      keys.delete(key);
      if (keys.size === 0) {
        this.#baseKeysByJoinValue.delete(joinValue);
      }
    }
  }

  private indexRightRow(row: VuuDataRow) {
    const joinValue = row[this.#rightIdx];
    if (!this.#rightKeyByJoinValue.has(joinValue)) {
      this.#rightKeyByJoinValue.set(
        joinValue,
        String(row[this.joinTable.indexOfKeyField]),
      );
    }
  }

  private unindexRightRow(row: VuuDataRow) {
    const joinValue = row[this.#rightIdx];
    const key = String(row[this.joinTable.indexOfKeyField]);
    if (this.#rightKeyByJoinValue.get(joinValue) === key) {
      this.#rightKeyByJoinValue.delete(joinValue);
      // another right row may share the join value
      for (const r of this.joinTable.rows) {
        if (
          r[this.#rightIdx] === joinValue &&
          String(r[this.joinTable.indexOfKeyField]) !== key
        ) {
          this.#rightKeyByJoinValue.set(
            joinValue,
            String(r[this.joinTable.indexOfKeyField]),
          );
          break;
        }
      }
    }
  }

  /** Join tables are read-only, rows are derived from the source tables */
  override insert(_row: VuuDataRow): number {
    throw Error(`[JoinTable] ${this.name} is read only`);
  }
  override upsert(_row: VuuDataRow): void {
    throw Error(`[JoinTable] ${this.name} is read only`);
  }
}
