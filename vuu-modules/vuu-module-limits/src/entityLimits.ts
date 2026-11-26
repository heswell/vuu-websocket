import type { DataTable } from "@heswell/vuu-server";
import type {
  VuuDataRow,
  VuuRowDataItemType,
} from "@vuu-ui/vuu-protocol-types";

/**
 * How a value set on an entity applies to the entities below it.
 * - override: an entity's own value replaces its parent's, higher or lower.
 * - cap: an entity can only go lower than its parent. Its own value must not
 *   be above its parent's effective value.
 */
export type EntityLimitRule = "override" | "cap";

export interface EntityLimitMetric {
  /** The column holding the entity's own value, blank when not set. */
  column: string;
  /** The column holding the value that applies: own, or inherited. */
  effectiveColumn: string;
  label: string;
  rule: EntityLimitRule;
}

const metric = (
  column: string,
  label: string,
  rule: EntityLimitRule,
): EntityLimitMetric => ({
  column,
  effectiveColumn: `${column}_eff`,
  label,
  rule,
});

/** The metrics of the entityLimits table. */
export const ENTITY_LIMIT_METRICS: readonly EntityLimitMetric[] = [
  metric("max_order_qty", "Max order quantity", "override"),
  metric("max_order_notional", "Max order notional", "override"),
  metric("orders_per_sec", "Orders per second", "override"),
  metric("var", "VaR", "cap"),
  metric("drawdown", "Drawdown", "cap"),
];

/** The columns of entityLimits a user can edit. */
export const ENTITY_LIMIT_OWN_COLUMNS = ENTITY_LIMIT_METRICS.map(
  ({ column }) => column,
);

/** Own values of the entities that set any, by entity_id. */
export const INITIAL_ENTITY_LIMITS: Readonly<
  Record<string, Partial<Record<string, number>>>
> = {
  FIRM: {
    max_order_qty: 1_000_000,
    max_order_notional: 50_000_000,
    orders_per_sec: 500,
    var: 10_000_000,
    drawdown: 2_000_000,
  },
  "LE-US": { var: 4_000_000 },
  "DESK-EQD": { max_order_qty: 250_000, orders_per_sec: 200 },
  "DESK-CASH": { drawdown: 500_000 },
  "DESK-RATES": { max_order_notional: 100_000_000 },
  "BOOK-EQD-02": { max_order_qty: 50_000 },
  "TRD-JSMITH": { orders_per_sec: 20, drawdown: 250_000 },
};

const isBlank = (value: unknown) =>
  value === undefined || value === null || value === "";

/** An own value: blank, or a number greater than zero. */
export const validateEntityLimitValue = (
  column: string,
  value: VuuRowDataItemType | undefined,
): string | undefined => {
  if (isBlank(value) || !ENTITY_LIMIT_OWN_COLUMNS.includes(column)) {
    return undefined;
  }
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? undefined
    : `${column} must be a number greater than zero`;
};

type EffectiveValue = number | null;

const ownValue = (value: unknown): EffectiveValue =>
  isBlank(value) ? null : Number(value);

const resolve = (
  rule: EntityLimitRule,
  own: EffectiveValue,
  parent: EffectiveValue,
) => {
  if (own === null) return parent;
  if (rule === "override" || parent === null) return own;
  return Math.min(own, parent);
};

/**
 * Sets the effective value of every metric of every row of an entityLimits
 * table, or of a session table copied from one. A row whose parent isn't in
 * the table takes its parent's effective values from `inheritedValue`. A
 * chain of parents that leads back to itself is broken where it closes.
 * Rows are updated without naming a column, so a session table doesn't
 * record the effective values as edits.
 *
 * Returns, by key, the first cap each row breaks: an own value above its
 * parent's effective value.
 */
export const resolveEntityLimits = (
  table: DataTable,
  inheritedValue: (
    parentKey: string,
    effectiveColumn: string,
  ) => EffectiveValue = () => null,
): Map<string, string> => {
  const { columnMap, indexOfKeyField } = table;
  const parentIndex = columnMap.parent_id;
  const rowsByKey = new Map(
    table.rows.map((row) => [String(row[indexOfKeyField]), row]),
  );
  const updates = new Map<string, VuuDataRow>();
  const breaches = new Map<string, string>();

  for (const { column, effectiveColumn, label, rule } of ENTITY_LIMIT_METRICS) {
    const resolved = new Map<string, EffectiveValue>();
    const resolving = new Set<string>();

    const effectiveValue = (key: string): EffectiveValue => {
      const known = resolved.get(key);
      if (known !== undefined) return known;
      const row = rowsByKey.get(key) as VuuDataRow;
      resolving.add(key);
      const parentKey = String(row[parentIndex] ?? "");
      let parentValue: EffectiveValue = null;
      if (parentKey !== "" && !resolving.has(parentKey)) {
        parentValue = rowsByKey.has(parentKey)
          ? effectiveValue(parentKey)
          : inheritedValue(parentKey, effectiveColumn);
      }
      resolving.delete(key);
      const own = ownValue(row[columnMap[column]]);
      if (
        rule === "cap" &&
        own !== null &&
        parentValue !== null &&
        own > parentValue &&
        !breaches.has(key)
      ) {
        breaches.set(
          key,
          `${label} ${own} is above ${parentValue}, the limit of ${parentKey}`,
        );
      }
      const value = resolve(rule, own, parentValue);
      resolved.set(key, value);
      return value;
    };

    for (const [key, row] of rowsByKey) {
      const value = effectiveValue(key);
      const index = columnMap[effectiveColumn];
      if (ownValue(row[index]) !== value) {
        const updated = updates.get(key) ?? row.slice();
        updated[index] = value as VuuRowDataItemType;
        updates.set(key, updated);
      }
    }
  }

  for (const [key, row] of updates) {
    table.update(table.rowIndexAtKey(key), row);
  }
  return breaches;
};
