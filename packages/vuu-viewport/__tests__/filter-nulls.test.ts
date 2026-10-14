import { describe, expect, test } from "bun:test";
import { parseAndCompileFilter } from "../src/filter.ts";

// Unmatched LEFT JOIN columns are null; relational filters must not treat
// null as 0 (trader upstream issue 33).
const columnMap = { id: 0, bid: 1 };
const rows = [
  ["a", 1.5],
  ["b", null],
  ["c", 0],
  ["d", undefined],
] as unknown as Parameters<
  NonNullable<ReturnType<typeof parseAndCompileFilter>>["predicate"]
>[0][];

const match = (query: string) => {
  const { predicate } = parseAndCompileFilter(query, columnMap)!;
  return rows.filter((row) => predicate(row)).map((row) => row[0]);
};

describe("relational filters with null values", () => {
  test.each([
    ["bid < 1", ["c"]],
    ["bid <= 0", ["c"]],
    ["bid >= 0", ["a", "c"]],
    ["bid > -1", ["a", "c"]],
  ])("%s", (query, expected) => {
    expect(match(query)).toEqual(expected);
  });
});
