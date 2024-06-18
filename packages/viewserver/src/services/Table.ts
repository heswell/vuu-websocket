import { Table as BaseTable } from '@heswell/data';
import { TableWithGenerators } from '@heswell/server-core';

export class Table extends BaseTable {
  async loadData(dataPath: string) {
    try {
      const { data } = await import(`${dataPath}`);
      if (data) {
        this.parseData(data);
      }
    } catch (e) {
      console.error(`failed to load data from path '${dataPath}'`, e);
    }
  }

  async installDataGenerators({ createPath, updatePath }: TableWithGenerators) {
    if (createPath) {
      const { default: createGenerator } = await import(`${createPath}`);
      this.createRow = createGenerator.default;
    }
    if (updatePath) {
      const { default: updateGenerator } = await import(`${updatePath}`);
      this.updateRow = updateGenerator.default;
    }
  }
}
