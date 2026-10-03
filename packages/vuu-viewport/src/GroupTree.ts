import type { RowSource, VuuDataRow } from "@heswell/vuu-table";
import type {
  VuuAggregation,
  VuuRowDataItemType,
  VuuSortCol,
} from "@vuu-ui/vuu-protocol-types";

export const ROOT_KEY = "$root";
const SEPARATOR = "|";

const SUM = 1;
const AVG = 2;
const COUNT = 3;
const HIGH = 4;
const LOW = 5;
const DISTINCT = 6;

interface AggDef {
  /** column index in table rows */
  col: number;
  type: number;
}

export class GroupNode {
  children: GroupNode[] | null = null;
  childMap: Map<VuuRowDataItemType, GroupNode> | null = null;
  /** row indices, only populated for the lowest level of group */
  leaves: number[] | null = null;
  leafCount = 0;
  /** primary agg value: sum / high / low / non-null count */
  agg: Float64Array;
  /** sample count, used by average */
  aggN: Int32Array;
  distinct: (Set<VuuRowDataItemType> | undefined)[] | undefined;
  /** incremented whenever node content (aggregates, child count) changes */
  version = 0;

  constructor(
    readonly key: string,
    readonly label: VuuRowDataItemType,
    readonly depth: number,
    readonly parent: GroupNode | null,
    aggCount: number,
  ) {
    this.agg = new Float64Array(aggCount);
    this.aggN = new Int32Array(aggCount);
  }

  get childCount() {
    return this.children !== null
      ? this.children.length
      : (this.leaves?.length ?? 0);
  }
}

const toNumber = (value: VuuRowDataItemType | undefined) => {
  if (typeof value === "number") return value;
  if (value === null || value === undefined || value === "") return NaN;
  return Number(value);
};

function initAgg(node: GroupNode, defs: AggDef[]) {
  for (let i = 0; i < defs.length; i++) {
    const type = defs[i].type;
    node.agg[i] = type === HIGH ? -Infinity : type === LOW ? Infinity : 0;
    if (type === DISTINCT) {
      (node.distinct ??= [])[i] = new Set();
    }
  }
}

function accumulateLeaf(node: GroupNode, defs: AggDef[], row: VuuDataRow) {
  const agg = node.agg;
  for (let i = 0; i < defs.length; i++) {
    const { col, type } = defs[i];
    const value = row[col];
    if (type === DISTINCT) {
      if (value !== null && value !== undefined) {
        node.distinct![i]!.add(value);
      }
      continue;
    }
    if (type === COUNT) {
      if (value !== null && value !== undefined) agg[i] += 1;
      continue;
    }
    const n = toNumber(value);
    if (n !== n) continue; // NaN
    switch (type) {
      case SUM:
        agg[i] += n;
        break;
      case AVG:
        agg[i] += n;
        node.aggN[i] += 1;
        break;
      case HIGH:
        if (n > agg[i]) agg[i] = n;
        break;
      case LOW:
        if (n < agg[i]) agg[i] = n;
        break;
    }
  }
}

function combineChild(node: GroupNode, child: GroupNode, defs: AggDef[]) {
  const agg = node.agg;
  for (let i = 0; i < defs.length; i++) {
    switch (defs[i].type) {
      case SUM:
      case COUNT:
        agg[i] += child.agg[i];
        break;
      case AVG:
        agg[i] += child.agg[i];
        node.aggN[i] += child.aggN[i];
        break;
      case HIGH:
        if (child.agg[i] > agg[i]) agg[i] = child.agg[i];
        break;
      case LOW:
        if (child.agg[i] < agg[i]) agg[i] = child.agg[i];
        break;
      case DISTINCT:
        for (const v of child.distinct![i]!) node.distinct![i]!.add(v);
        break;
    }
  }
}

export function aggValue(node: GroupNode, i: number, type: number) {
  switch (type) {
    case AVG:
      return node.aggN[i] === 0 ? 0 : node.agg[i] / node.aggN[i];
    case HIGH:
    case LOW:
      return Number.isFinite(node.agg[i]) ? node.agg[i] : null;
    case DISTINCT:
      return Array.from(node.distinct![i]!).join(",");
    default:
      return node.agg[i];
  }
}

/**
 * Entry in the flattened, visible list of a group tree. A GroupNode for a
 * group row, a number (table row index) for a leaf row.
 */
export type VisibleEntry = GroupNode | number;

/**
 * Group-by tree over the filtered, sorted rows of a viewport. The tree is
 * rebuilt in O(n * depth) when the row set changes structurally. Updates to
 * aggregated columns are applied incrementally where the aggregation type
 * allows (sum, average, count, and high/low when the extreme is not
 * reduced).
 */
export class GroupTree {
  readonly root: GroupNode;
  readonly groupCols: number[];
  readonly aggDefs: AggDef[];
  /** table column index -> agg def indices for that column */
  readonly aggsByColumn: Map<number, number[]>;
  /** expanded tree keys, preserved across rebuilds */
  readonly expanded: Set<string>;
  readonly nodesByKey = new Map<string, GroupNode>();
  /** leaf row index -> lowest level group node */
  leafParent: (GroupNode | undefined)[] = [];
  visible: VisibleEntry[] = [];

  constructor(
    private table: RowSource,
    groupBy: string[],
    aggregations: VuuAggregation[],
    expanded: Set<string> = new Set(),
  ) {
    const { columnMap } = table;
    this.groupCols = groupBy.map((name) => {
      const idx = columnMap[name];
      if (idx === undefined) {
        throw Error(`[GroupTree] unknown groupBy column ${name}`);
      }
      return idx;
    });
    this.aggDefs = [];
    this.aggsByColumn = new Map();
    for (const { column, aggType } of aggregations) {
      const col = columnMap[column];
      if (col !== undefined) {
        const i = this.aggDefs.push({ col, type: aggType }) - 1;
        const existing = this.aggsByColumn.get(col);
        if (existing) existing.push(i);
        else this.aggsByColumn.set(col, [i]);
      }
    }
    this.expanded = expanded;
    this.root = new GroupNode(ROOT_KEY, "", 0, null, this.aggDefs.length);
  }

  get leafDepth() {
    return this.groupCols.length + 1;
  }

  /**
   * Build tree from a sorted index of row positions. Leaves within each
   * group retain index order.
   */
  build(index: Int32Array, len: number) {
    const rows = this.table.rows;
    const { groupCols, aggDefs, root, nodesByKey } = this;
    const depth = groupCols.length;
    const aggCount = aggDefs.length;
    const leafParent: (GroupNode | undefined)[] = new Array(rows.length);

    nodesByKey.clear();
    root.children = [];
    root.childMap = new Map();
    root.leafCount = 0;
    root.agg.fill(0);
    root.aggN.fill(0);
    root.distinct = undefined;
    initAgg(root, aggDefs);
    root.version += 1;

    for (let i = 0; i < len; i++) {
      const rowIdx = index[i];
      const row = rows[rowIdx];
      let node = root;
      for (let level = 0; level < depth; level++) {
        const value = row[groupCols[level]];
        let child = node.childMap!.get(value);
        if (child === undefined) {
          child = new GroupNode(
            node.key + SEPARATOR + String(value),
            value,
            level + 1,
            node,
            aggCount,
          );
          initAgg(child, aggDefs);
          if (level < depth - 1) {
            child.children = [];
            child.childMap = new Map();
          } else {
            child.leaves = [];
          }
          node.childMap!.set(value, child);
          node.children!.push(child);
          nodesByKey.set(child.key, child);
        }
        node.leafCount += 1;
        node = child;
      }
      node.leafCount += 1;
      node.leaves!.push(rowIdx);
      leafParent[rowIdx] = node;
      if (aggCount > 0) accumulateLeaf(node, aggDefs, row);
    }

    if (aggCount > 0 && depth > 0) {
      this.rollUp(root);
    }
    this.leafParent = leafParent;
  }

  private rollUp(node: GroupNode) {
    if (node.children) {
      for (const child of node.children) {
        this.rollUp(child);
        combineChild(node, child, this.aggDefs);
      }
    }
  }

  /**
   * Order group nodes. A sort column that is a groupBy column orders groups
   * at that level by value, a sort column that is aggregated orders groups
   * by aggregate value. Otherwise groups are ordered by value ascending.
   */
  sortGroups(sortDefs: readonly VuuSortCol[]) {
    const { columnMap } = this.table;
    const levelSort: { dir: number; agg: number; aggType: number }[] = [];
    for (let level = 0; level < this.groupCols.length; level++) {
      const groupCol = this.groupCols[level];
      let entry = { dir: 1, agg: -1, aggType: 0 };
      for (const { column, sortType } of sortDefs) {
        const col = columnMap[column];
        const dir = sortType === "D" ? -1 : 1;
        if (col === groupCol) {
          entry = { dir, agg: -1, aggType: 0 };
          break;
        }
        const aggIndices = this.aggsByColumn.get(col);
        if (aggIndices) {
          const agg = aggIndices[0];
          entry = { dir, agg, aggType: this.aggDefs[agg].type };
          break;
        }
      }
      levelSort.push(entry);
    }

    const sortChildren = (node: GroupNode, level: number) => {
      if (node.children === null) return;
      const { dir, agg, aggType } = levelSort[level];
      if (agg === -1) {
        node.children.sort((n1, n2) => {
          const v1 = n1.label;
          const v2 = n2.label;
          if (v1 === v2) return 0;
          if (v1 === null || v1 === undefined) return -dir;
          if (v2 === null || v2 === undefined) return dir;
          return v1 < v2 ? -dir : dir;
        });
      } else {
        node.children.sort((n1, n2) => {
          const v1 = aggValue(n1, agg, aggType) as number;
          const v2 = aggValue(n2, agg, aggType) as number;
          return v1 < v2 ? -dir : v1 > v2 ? dir : 0;
        });
      }
      for (const child of node.children) sortChildren(child, level + 1);
    };
    sortChildren(this.root, 0);
  }

  flatten() {
    const visible: VisibleEntry[] = [];
    const { expanded } = this;
    const visit = (node: GroupNode) => {
      if (node.children) {
        for (const child of node.children) {
          visible.push(child);
          if (expanded.has(child.key)) visit(child);
        }
      } else if (node.leaves) {
        for (const leaf of node.leaves) visible.push(leaf);
      }
    };
    visit(this.root);
    this.visible = visible;
  }

  /**
   * Apply an update to an aggregated column for a single leaf row.
   * Returns false if the change cannot be applied incrementally, in which
   * case the tree must be rebuilt.
   */
  updateAggregates(
    rowIdx: number,
    previous: VuuDataRow,
    row: VuuDataRow,
  ): boolean {
    const leafNode = this.leafParent[rowIdx];
    if (leafNode === undefined) return true;
    for (const [col, aggIndices] of this.aggsByColumn) {
      const oldValue = previous[col];
      const newValue = row[col];
      if (oldValue === newValue) continue;
      for (const i of aggIndices) {
        const type = this.aggDefs[i].type;
        if (type === DISTINCT) return false;
        if (type === COUNT) {
          const delta =
            (newValue === null || newValue === undefined ? 0 : 1) -
            (oldValue === null || oldValue === undefined ? 0 : 1);
          if (delta !== 0) {
            for (let n: GroupNode | null = leafNode; n; n = n.parent) {
              n.agg[i] += delta;
            }
          }
          continue;
        }
        const o = toNumber(oldValue);
        const v = toNumber(newValue);
        const oValid = o === o;
        const vValid = v === v;
        if (type === SUM || type === AVG) {
          const delta = (vValid ? v : 0) - (oValid ? o : 0);
          const deltaN = (vValid ? 1 : 0) - (oValid ? 1 : 0);
          for (let n: GroupNode | null = leafNode; n; n = n.parent) {
            n.agg[i] += delta;
            if (type === AVG) n.aggN[i] += deltaN;
          }
        } else if (type === HIGH || type === LOW) {
          const isHigh = type === HIGH;
          for (let n: GroupNode | null = leafNode; n; n = n.parent) {
            const current = n.agg[i];
            if (
              oValid &&
              o === current &&
              (!vValid || (isHigh ? v < o : v > o))
            ) {
              // the extreme value has been reduced, must recompute
              return false;
            }
            if (vValid && (isHigh ? v > current : v < current)) {
              n.agg[i] = v;
            }
          }
        }
      }
    }
    for (let n: GroupNode | null = leafNode; n; n = n.parent) {
      n.version += 1;
    }
    return true;
  }

  get hasAggregates() {
    return this.aggDefs.length > 0;
  }

  isGroupColumn(col: number) {
    return this.groupCols.includes(col);
  }
}

export const AggregationType = {
  Sum: SUM,
  Average: AVG,
  Count: COUNT,
  High: HIGH,
  Low: LOW,
  Distinct: DISTINCT,
} as const;
