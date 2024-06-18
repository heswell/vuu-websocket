import { DataTableDefinition, TableColumn } from "@heswell/server-types";
import { ColumnMap } from "@vuu-ui/utils";
import { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import { buildColumnMap } from "./columnUtils.js";
import { EventEmitter } from "./event-emitter.js";

const defaultUpdateConfig = {
  applyUpdates: false,
  applyInserts: false,
  interval: 500,
};

export class Table extends EventEmitter {
  #index: Record<string, number> = {};
  #keys: Record<string, number> = {};
  #columnCount = 0;

  public columnMap: ColumnMap;
  public columns: TableColumn[];
  public name: string;
  public primaryKey: string;
  public rows: VuuRowDataItemType[] = [];
  public status: "ready" | null = null;

  constructor(config: DataTableDefinition) {
    super();

    const { name, columns, primaryKey, dataPath, data, updates = {} } = config;

    this.name = name;
    this.primaryKey = primaryKey;
    this.columns = columns;

    this.updateConfig = {
      ...defaultUpdateConfig,
      ...updates,
    };
    this.columnMap = buildColumnMap(columns);

    // console.log(`Table
    //     columns = ${JSON.stringify(columns,null,2)}
    //     columnMap = ${JSON.stringify(this.columnMap,null,2)}
    //     `)

    if (data) {
      this.parseData(data);
    } else if (dataPath) {
      this.loadData(dataPath);
    }

    this.installDataGenerators(config);
  }

  update(rowIdx: number, ...updates) {
    const results = [];
    let row = this.rows[rowIdx];
    for (let i = 0; i < updates.length; i += 2) {
      const colIdx = updates[i];
      const value = updates[i + 1];
      results.push(colIdx, row[colIdx], value);
      row[colIdx] = value;
    }
    this.emit("rowUpdated", rowIdx, results);
  }

  insert(data) {
    let columnnameList = this.columns ? this.columns.map((c) => c.name) : null;
    const idx = this.rows.length;
    let row = this.rowFromData(idx, data, columnnameList);
    this.rows.push(row);
    this.emit("rowInserted", idx, row);
  }

  remove(key) {
    if (this.#keys[key]) {
      const index = this.indices[key];
      delete this.#keys[key];
      delete this.indices[key];
      this.rows.splice(index, 1);

      for (let k in this.indices) {
        if (this.indices[k] > index) {
          this.indices[k] -= 1;
        }
      }

      this.emit("rowRemoved", this.name, key);
    }
  }

  clear() {}

  async loadData(url) {
    fetch(url, {})
      .then((data) => data.json())
      .then((json) => {
        console.log(`Table.loadData: got ${json.length} rows`);
        this.parseData(json);
      })
      .catch((err) => {
        console.error(err);
      });
  }

  parseData(data) {
    console.log(`parseData ${data.length} rows`);
    let columnnameList = this.columns ? this.columns.map((c) => c.name) : null;
    const rows = [];
    for (let i = 0; i < data.length; i++) {
      let row = this.rowFromData(i, data[i], columnnameList);
      rows.push(row);
    }
    this.rows = rows;

    if (this.columns === null) {
      this.columns = columnsFromColumnMap(this.inputColumnMap);
      this.columnMap = buildColumnMap(this.columns);
    }
    this.status = "ready";
    this.emit("ready");
    if (this.updateConfig && this.updateConfig.applyUpdates !== false) {
      setTimeout(() => {
        this.applyUpdates();
      }, 1000);
    }
    // move this
    if (this.updateConfig && this.updateConfig.applyInserts !== false) {
      setTimeout(() => {
        this.applyInserts();
      }, 10000);
    }
  }

  rowFromData(idx: number, data: VuuDataRow, columnnameList: string[]) {
    // 2 metadata items for each row, the idx and unique key
    const { primaryKey = null, columnMap: map } = this;

    if (Array.isArray(data)) {
      const key = data[map[this.primaryKey]] as string;
      this.#index[key] = idx;
      return [...data, idx, key];
    } else {
      // This allows us to load data from objects as rows, without predefined columns, where
      // not every row may have every column. How would we handle primary key ?
      const columnMap = map || (this.columnMap = {});
      const colnames = columnnameList || Object.getOwnPropertyNames(data);
      // why start with idx in 0 ?
      const row = [idx];
      let colIdx;
      let key;

      for (let i = 0; i < colnames.length; i++) {
        const name = colnames[i];
        const value = data[name];
        if ((colIdx = columnMap[name]) === undefined) {
          colIdx = columnMap[name] = this.#columnCount++;
        }
        row[colIdx] = value;
        // If we don't know the primary key, assume it is the first column for now
        if (name === primaryKey || (primaryKey === null && i === 0)) {
          key = value;
          this.#index[value] = idx;
        }
      }
      // doesn't this risk pushing the metadata into the wrong slots if not every row has every
      // field// TODO why do we need metadata fields in table itself ?
      row.push(idx, key);
      return row;
    }
  }

  //TODO move all these methods into an external helper
  applyInserts() {
    const idx = this.rows.length;
    const newRow = this.createRow(idx);
    if (newRow) {
      this.insert(newRow);
    } else {
      console.log(`createRow did not return a new row`);
    }

    setTimeout(
      () => this.applyInserts(),
      this.updateConfig.insertInterval | 100
    );
  }

  applyUpdates() {
    const { rows, columnMap } = this;
    // const count = Math.round(rows.length / 50);
    const count = 100;

    for (let i = 0; i < count; i++) {
      const rowIdx = getRandomInt(rows.length - 1);
      const update = this.updateRow(rowIdx, rows[rowIdx], columnMap);
      if (update) {
        this.update(rowIdx, ...update);
      }
    }

    setTimeout(() => this.applyUpdates(), this.updateConfig.interval);
  }

  createRow(idx: number) {
    console.warn(`createRow ${idx} must be implemented as a plugin`);
  }

  updateRow(/*idx, row, columnMap*/) {
    return null;
  }

  async installDataGenerators(_config: TableWithGenerators) {
    //console.warn(`installDataGenerators must be implemented by a more specific subclass`);
  }
}

function getRandomInt(max: number) {
  return Math.floor(Math.random() * Math.floor(max));
}

type KeyName = {
  key: number;
  name: string;
};
function columnsFromColumnMap(columnMap: ColumnMap) {
  const columnNames = Object.getOwnPropertyNames(columnMap);

  return columnNames
    .map<KeyName>((name) => ({ name, key: columnMap[name] }))
    .sort(byKey)
    .map(({ name }) => ({ name }));
}

function byKey(col1: KeyName, col2: KeyName) {
  return col1.key - col2.key;
}
