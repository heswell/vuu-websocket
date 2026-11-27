import { Provider, type DataTable } from "@heswell/vuu-server";
import type { Table, TableListener } from "@heswell/vuu-table";
import {
  ENTITY_LIMIT_OWN_COLUMNS,
  INITIAL_ENTITY_LIMITS,
  resolveEntityLimits,
} from "./entityLimits";
import { LIMIT_ENTITIES } from "./referenceData";

/** Loads the entities, from the reference data. */
export class EntitiesProvider extends Provider {
  async load() {
    for (const entity of LIMIT_ENTITIES) {
      this.insertRow({ ...entity });
    }
  }
}

const noOwnValues = Object.fromEntries(
  ENTITY_LIMIT_OWN_COLUMNS.map((column) => [column, null]),
);

/**
 * Loads a row per entity, with the own values of INITIAL_ENTITY_LIMITS.
 * The effective values are resolved on load, and again whenever a row is
 * added, changed or deleted.
 */
export class EntityLimitsProvider extends Provider {
  #resolving = false;

  constructor(table: Table) {
    super(table);
    const resolve = () => {
      if (this.#resolving) return;
      this.#resolving = true;
      try {
        resolveEntityLimits(this.table as unknown as DataTable);
      } finally {
        this.#resolving = false;
      }
    };
    const listener: TableListener = {
      onDelete: resolve,
      onInsert: resolve,
      onUpdate: resolve,
    };
    table.addListener(listener);
  }

  async load() {
    for (const { entity_id, entity_type, name, parent_id } of LIMIT_ENTITIES) {
      this.insertRow({
        entity_id,
        entity_type,
        name,
        parent_id,
        ...noOwnValues,
        ...INITIAL_ENTITY_LIMITS[entity_id],
      });
    }
    resolveEntityLimits(this.table as unknown as DataTable);
  }
}
