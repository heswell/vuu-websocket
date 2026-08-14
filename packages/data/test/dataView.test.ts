import { describe, expect, test } from "bun:test";
import type { DataTable } from "@heswell/vuu-server/src/core/table/InMemDataTable";
import type { TableSchema } from "@vuu-ui/vuu-data-types";
import type { DataResponse } from "../src/store/rowset";
import { DataView, Table, type DataViewConfig } from "../src";

const schema: TableSchema = {
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "name", serverDataType: "string" },
  ],
  key: "id",
  table: {
    module: "TEST",
    table: "items",
  },
};

const config: DataViewConfig = {
  aggregations: [],
  columns: ["id", "name"],
  filterSpec: { filter: "" },
  groupBy: [],
  range: { from: 0, to: 10 },
  sort: { sortDefs: [] },
};

class TestDataView extends DataView {
  readonly responses: DataResponse[] = [];

  postDataResponse(response: DataResponse | void) {
    if (response) {
      this.responses.push(response);
    }
  }
}

describe("DataView table events", () => {
  test("posts row insert and delete responses", () => {
    const table = new Table({ schema });
    const dataView = new TestDataView(
      "test-view",
      table as unknown as DataTable,
      config,
    );

    table.insert(["1", "Alice"]);
    table.delete("1");

    expect(dataView.responses).toHaveLength(2);
    expect(dataView.responses[0].size).toBe(1);
    expect(dataView.responses[0].sizeMessageRequired).toBe(true);
    expect(dataView.responses[1].size).toBe(0);
    expect(dataView.responses[1].sizeMessageRequired).toBe(true);
  });
});
