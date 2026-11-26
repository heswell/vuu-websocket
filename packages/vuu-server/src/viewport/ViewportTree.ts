import type { TableSchema } from "@heswell/vuu-table";
import type { VuuTree } from "@heswell/vuu-viewport";
import { ClientRequestError } from "../net/ClientRequestError";

/**
 * Adds the optional parent-key tree to a viewport request or reply. The
 * published protocol types don't have it yet.
 */
export type WithTree<T> = T & { tree?: VuuTree };

/**
 * Checks a requested tree against the table and the rest of the viewport
 * config. Throws a ClientRequestError when the tree can't be built.
 */
export const validateTree = (
  tree: VuuTree | undefined,
  schema: TableSchema,
  groupBy: readonly string[] = [],
  aggregations: readonly unknown[] = [],
) => {
  if (tree === undefined) return;
  const { parentColumn } = tree;
  if (groupBy.length > 0) {
    throw new ClientRequestError("tree cannot be combined with groupBy");
  }
  if (aggregations.length > 0) {
    throw new ClientRequestError("tree cannot be combined with aggregations");
  }
  const parent = schema.columns.find(({ name }) => name === parentColumn);
  if (parent === undefined) {
    throw new ClientRequestError(
      `tree parentColumn ${parentColumn} is not a column of ${schema.table.table}`,
    );
  }
  const key = schema.columns.find(({ name }) => name === schema.key);
  if (key && key.serverDataType !== parent.serverDataType) {
    throw new ClientRequestError(
      `tree parentColumn ${parentColumn} must have the data type of key column ${schema.key}`,
    );
  }
};
