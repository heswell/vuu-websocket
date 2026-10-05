import type { VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";

const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export const isSafeBigInt = (value: bigint) =>
  value >= MIN_SAFE && value <= MAX_SAFE;

/**
 * Convert a table value to a protocol (JSON serializable) value. A bigint
 * becomes a number if it can be represented exactly, otherwise its decimal
 * string, so precision is never silently lost.
 */
export const toProtocolValue = (value: unknown): VuuRowDataItemType => {
  if (typeof value === "bigint") {
    return isSafeBigInt(value) ? Number(value) : value.toString();
  }
  return value as VuuRowDataItemType;
};

/**
 * The equivalent value in the other integer representation (number <->
 * bigint), or undefined if there is none. Used so that equality based
 * filters match a column of bigint values against numeric filter values,
 * and vice versa.
 */
export const integerAlias = (value: unknown): number | bigint | undefined => {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "bigint" && isSafeBigInt(value)) {
    return Number(value);
  }
  return undefined;
};

/** A set of values plus the integer aliases of any of them. */
export const withIntegerAliases = <T>(values: Iterable<T>): Set<unknown> => {
  const result = new Set<unknown>();
  for (const value of values) {
    result.add(value);
    const alias = integerAlias(value);
    if (alias !== undefined) result.add(alias);
  }
  return result;
};
