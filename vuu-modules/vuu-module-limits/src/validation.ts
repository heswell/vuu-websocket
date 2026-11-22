import type { VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import {
  LIMIT_CURRENCIES,
  LIMIT_ENTITIES,
  LIMIT_METRIC_NAMES,
  LIMIT_METRICS,
  LIMIT_PERIODS,
  type LimitPeriod,
} from "./referenceData";
import { LIMIT_DEFINITION_COLUMNS, LIMIT_REQUIRED_COLUMNS } from "./tableDefs";

export type LimitValues = Record<string, VuuRowDataItemType | undefined>;

export const isBlank = (value: unknown) =>
  value === undefined || value === null || value === "";

const isNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Rules for a single value, applied to cell edits, added rows and imported
 * values. A blank value is accepted: required columns, and rules across
 * columns, are checked when changes are saved, see
 * {@link validateLimitDefinition}.
 */
export const validateLimitValue = (
  column: string,
  value: VuuRowDataItemType | undefined,
): string | undefined => {
  if (isBlank(value)) {
    return undefined;
  }
  switch (column) {
    case "entity_id":
      return LIMIT_ENTITIES.some(({ entity_id }) => entity_id === value)
        ? undefined
        : `entity ${value} is not known`;
    case "metric":
      return LIMIT_METRIC_NAMES.includes(String(value))
        ? undefined
        : `metric ${value} is not known`;
    case "period":
      return (LIMIT_PERIODS as readonly unknown[]).includes(value)
        ? undefined
        : `period must be one of ${LIMIT_PERIODS.join(", ")}`;
    case "warning":
    case "soft":
    case "hard":
      return isNumber(value) && Number(value) > 0
        ? undefined
        : `${column} must be a number greater than zero`;
    case "currency":
      return (LIMIT_CURRENCIES as readonly unknown[]).includes(value)
        ? undefined
        : `currency must be one of ${LIMIT_CURRENCIES.join(", ")}`;
    default:
      return undefined;
  }
};

/**
 * Rules for a whole limit, applied when changes are saved. Returns the
 * first error found.
 */
export const validateLimitDefinition = (
  limit: LimitValues,
): string | undefined => {
  for (const column of LIMIT_REQUIRED_COLUMNS) {
    if (isBlank(limit[column])) {
      return `${column} is required`;
    }
  }
  for (const column of LIMIT_DEFINITION_COLUMNS) {
    const error = validateLimitValue(column, limit[column]);
    if (error) return error;
  }
  const { effective_from, effective_to, hard, metric, period, soft, warning } =
    limit;
  const { periods } = LIMIT_METRICS[String(metric)];
  if (!periods.includes(period as LimitPeriod)) {
    return `period of ${metric} must be ${periods.join(" or ")}`;
  }
  if (!isBlank(soft) && Number(soft) > Number(hard)) {
    return "soft must not be greater than hard";
  }
  if (!isBlank(warning) && Number(warning) > Number(soft || hard)) {
    return "warning must not be greater than soft or hard";
  }
  if (!isBlank(effective_to) && Number(effective_to) < Number(effective_from)) {
    return "effective_to must not be before effective_from";
  }
  return undefined;
};
