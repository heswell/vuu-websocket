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
  /**
   * leftOuter (default): every base row is present, right columns are null
   * when there is no matching right row.
   * inner: base rows are present only while a matching right row exists.
   */
  joinType?: JoinType;
}

export type JoinType = "leftOuter" | "inner";

type ColumnSource = 0 | 1; // 0 = base, 1 = right

const NO_KEYS: ReadonlySet<string> = new Set();

/**
 * Materialized left outer (or inner) join of two tables. Joined rows are maintained
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
  readonly joinType: JoinType;

  #inner: boolean;
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
    joinType = "leftOuter",
  }: JoinTableConfig) {
    super(schema);
    this.baseTable = baseTable;
    this.joinTable = joinTable;
    this.joinType = joinType;
    this.#inner = joinType === "inner";

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
    const baseKeyIdx = baseTable.indexOfKeyField;
    for (const row of baseTable.rows) {
      this.indexBaseRow(row);
      this.sync(String(row[baseKeyIdx]), row);
    }

    this.#baseListener = {
      onInsert: (_, row) => {
        this.indexBaseRow(row);
        this.sync(String(row[baseKeyIdx]), row);
      },
      onUpdate: (_, row, previous) => {
        const key = String(row[baseKeyIdx]);
        if (previous !== row) {
          const prevJoinValue = previous[this.#leftIdx];
          if (prevJoinValue !== row[this.#leftIdx]) {
            this.unindexBaseRow(key, prevJoinValue);
            this.indexBaseRow(row);
          }
        }
        this.sync(key, row);
      },
      onDelete: (_, row) => {
        const key = String(row[baseKeyIdx]);
        this.unindexBaseRow(key, row[this.#leftIdx]);
        if (this.rowIndexAtKey(key) !== -1) {
          super.delete(key);
        }
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
        if (this.#inner) {
          super.clear();
        } else {
          for (const row of this.baseTable.rows) {
            this.sync(String(row[baseKeyIdx]), row);
          }
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

  private joinRow(
    baseRow: VuuDataRow,
    rightRow: VuuDataRow | undefined,
  ): VuuDataRow {
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

  /**
   * Bring the joined row for a base row up to date: insert, update or, for an
   * inner join without a matching right row, delete it.
   */
  private sync(key: string, baseRow: VuuDataRow) {
    const rightRow = this.findRightRow(baseRow[this.#leftIdx]);
    const rowIdx = this.rowIndexAtKey(key);
    if (rightRow === undefined && this.#inner) {
      if (rowIdx !== -1) {
        super.delete(key);
      }
    } else if (rowIdx === -1) {
      super.insert(this.joinRow(baseRow, rightRow));
    } else {
      super.update(rowIdx, this.joinRow(baseRow, rightRow));
    }
  }

  private refreshForJoinValue(joinValue: VuuRowDataItemType) {
    const keys = this.#baseKeysByJoinValue.get(joinValue) ?? NO_KEYS;
    for (const key of keys) {
      const baseRow = this.baseTable.getRowAtKey(key, false);
      if (baseRow) {
        this.sync(key, baseRow);
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
