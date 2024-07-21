import { Table as BaseTable, TableGenerators } from "@heswell/data";

export class Table extends BaseTable {
  async loadData(dataPath: string) {
    try {
      const { getData } = await import(`${dataPath}`);
      if (getData) {
        this.parseData(getData(this.schema));
      }
    } catch (e) {
      console.error(`failed to load data from path '${dataPath}'`, e);
    }
  }

  installDataGenerators = async ({
    createPath,
    updatePath,
  }: TableGenerators) => {
    if (createPath) {
      const { default: createGenerator } = await import(`${createPath}`);
      this.createRow = createGenerator.default;
    }
    if (updatePath) {
      const { default: updateGenerator } = await import(`${updatePath}`);
      this.updateRow = updateGenerator.default;
    }
  };
}
