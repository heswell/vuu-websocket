import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  coerceCellValue,
  getLogger,
  Provider,
} from "@heswell/vuu-server";
import type { Table, TableListener, VuuDataRow } from "@heswell/vuu-table";
import { basketTrading, basketTradingConstituent } from "../BasketTableDefs";

const log = getLogger("basket.persistence");
const definitions = [basketTrading, basketTradingConstituent];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * One snapshot for both trading tables; prices and materialized joins are
 * deliberately excluded. A single server process owns the snapshot file.
 */
export class BasketPersistence {
  readonly path: string;
  private readonly saved = new Map<string, VuuDataRow[]>();
  private readonly tables = new Map<string, Table>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;
  private stopping = false;
  private readonly listener: TableListener = {
    onInsert: () => this.changed(),
    onUpdate: () => this.changed(),
    onDelete: () => this.changed(),
    onClear: () => this.changed(),
  };

  constructor(path: string) {
    if (path.trim() === "") throw new Error("Basket persistence path is empty");
    this.path = resolve(path);
    try {
      this.restore(JSON.parse(readFileSync(this.path, "utf8")));
      log.info(`Restored basket snapshot from ${this.path}`);
    } catch (error) {
      if (isObject(error) && error.code === "ENOENT") return;
      log.error(`Cannot restore basket snapshot from ${this.path}`, error);
      throw error;
    }
  }

  private restore(snapshot: unknown) {
    if (
      !isObject(snapshot) || snapshot.version !== 1 ||
      !isObject(snapshot.tables)
    ) {
      throw new Error("Invalid basket snapshot or unsupported version");
    }
    for (const def of definitions) {
      const records = snapshot.tables[def.name];
      if (!Array.isArray(records)) {
        throw new Error(`Basket snapshot is missing table ${def.name}`);
      }
      const keys = new Set<string>();
      const rows = records.map((record: unknown) => {
        if (isObject(record) && def === basketTradingConstituent) {
          // Version 1 snapshots predate the live-grid fields.
          if (!("orderStatus" in record) && !("filledQty" in record)) {
            record = {
              ...record,
              orderStatus: record.status === "ON_MARKET" ? "ACKED"
                : record.status === "OFF-MARKET" ? "CANCELLED" : "PENDING",
              filledQty: 0,
            };
          }
        }
        if (
          !isObject(record) ||
          Object.keys(record).length !== def.columns.length
        ) {
          throw new Error(`Invalid row in basket snapshot table ${def.name}`);
        }
        const row = def.columns.map(({ name, dataType }) =>
          coerceCellValue(record[name], dataType, name),
        );
        const key = record[def.keyField];
        if (typeof key !== "string" || key === "" || keys.has(key)) {
          throw new Error(`Invalid or duplicate key in ${def.name}`);
        }
        keys.add(key);
        return row;
      });
      this.saved.set(def.name, rows);
    }
    const baskets = new Map(
      (this.saved.get(basketTrading.name) ?? []).map((row) => [
        row[basketTrading.columns.findIndex(({ name }) => name === "instanceId")],
        row[basketTrading.columns.findIndex(({ name }) => name === "basketId")],
      ]),
    );
    const columns = basketTradingConstituent.columns;
    for (const row of this.saved.get(basketTradingConstituent.name) ?? []) {
      const instance = row[columns.findIndex(({ name }) => name === "instanceId")];
      const basket = row[columns.findIndex(({ name }) => name === "basketId")];
      if (!baskets.has(instance) || baskets.get(instance) !== basket) {
        throw new Error("Basket snapshot contains an orphaned constituent");
      }
    }
  }

  attach(table: Table) {
    for (const row of this.saved.get(table.name) ?? []) {
      table.insert(row.slice(), false);
    }
    this.tables.set(table.name, table);
    table.addListener(this.listener);
  }

  private changed() {
    this.dirty = true;
    this.schedule(100);
  }

  private schedule(delay: number) {
    if (this.stopping || this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      try {
        this.flush();
      } catch (error) {
        log.error(`Cannot save basket snapshot to ${this.path}; retrying`, error);
        this.schedule(1000);
      }
    }, delay);
  }

  flush() {
    if (!this.dirty) return;
    if (this.tables.size !== definitions.length) {
      throw new Error("Cannot save baskets before both trading tables are loaded");
    }
    const tables = Object.fromEntries(
      [...this.tables].map(([name, table]) => [
        name,
        table.rows.map((row) => Object.fromEntries(
          table.schema.columns.map((column, index) => [column.name, row[index]]),
        )),
      ]),
    );
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      const fd = openSync(temporary, "wx", 0o600);
      try {
        writeFileSync(fd, JSON.stringify({ version: 1, tables }, null, 2) + "\n");
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, this.path);
      this.dirty = false;
    } finally {
      try {
        unlinkSync(temporary);
      } catch (error) {
        if (!isObject(error) || error.code !== "ENOENT") throw error;
      }
    }
  }

  requestStop() {
    this.stopping = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  stop() {
    this.requestStop();
    try {
      this.flush();
    } catch (error) {
      log.error(`Cannot save basket snapshot on shutdown to ${this.path}`, error);
      throw error;
    } finally {
      for (const table of this.tables.values()) {
        table.removeListener(this.listener);
      }
    }
  }
}

export class PersistentBasketProvider extends Provider {
  constructor(table: Table, private readonly persistence: BasketPersistence) {
    super(table);
  }

  async load() {
    this.persistence.attach(this.table);
  }

  requestStop() {
    this.persistence.requestStop();
  }

  doStop() {
    this.persistence.stop();
  }

  doDestroy() {
    this.persistence.stop();
  }
}
