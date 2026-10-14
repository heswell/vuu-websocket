import { getDefaultEngine } from "../engine/LocalEngine";
import type { TableContainer } from "./TableContainer";

/**
 * @deprecated The default engine's table container, resolved lazily on each
 * access. Use `engine.tableContainer` of an engine you create.
 */
export const tableContainer: TableContainer = /* @__PURE__ */ new Proxy(
  {} as TableContainer,
  {
    get(_target, property) {
      const container = getDefaultEngine().tableContainer;
      const value = Reflect.get(container, property, container);
      return typeof value === "function" ? value.bind(container) : value;
    },
  },
);
