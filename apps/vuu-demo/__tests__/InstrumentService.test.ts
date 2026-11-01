import { describe, expect, test } from "bun:test";
import {
  InMemDataTable,
  JoinTableProvider,
  ProviderContainer,
  RequestContext,
  RpcParams,
  TableContainer,
  type Viewport,
  type Module,
} from "@heswell/vuu-server";
import { instruments } from "../src/modules/simul/SimulTableDefs";
import { InstrumentService } from "../src/modules/simul/services/InstrumentService";

const setup = () => {
  const joinProvider = new JoinTableProvider();
  const tableContainer = new TableContainer(joinProvider);
  instruments.setModule({ name: "SIMUL" } as Module);
  const table = new InMemDataTable(instruments, joinProvider);
  const { columnMap } = table;
  const row = table.schema.columns.map(() => "" as string | number);
  row[columnMap.ric] = "VOD.L";
  row[columnMap.lotSize] = 100;
  row[columnMap.vuuCreatedTimestamp] = 1;
  row[columnMap.vuuUpdatedTimestamp] = 1;
  table.insert(row);
  tableContainer.addTable(table);
  const service = new InstrumentService(
    table,
    {} as ProviderContainer,
    tableContainer,
  );
  const viewport = {
    dataTable: table,
    selectedKeys: new Set(),
  } as unknown as Viewport;
  const editCell = (column: string, data: unknown) =>
    service.processRpcRequest(
      "editCell",
      RpcParams({ key: "VOD.L", column, data }, viewport, {
        session: { sessionId: "s1", channelId: "c1" },
      } as RequestContext),
    );
  return { columnMap, editCell, table };
};

describe("InstrumentService", () => {
  test("instruments can be edited directly, without an edit session", () => {
    const { columnMap, editCell, table } = setup();
    expect(editCell("lotSize", 500)).toEqual({
      type: "SUCCESS_RESULT",
      data: undefined,
    });
    expect(table.getRowAtKey("VOD.L")[columnMap.lotSize]).toBe(500);
  });

  test("lotSize may not exceed 1,000", () => {
    const { columnMap, editCell, table } = setup();
    expect(editCell("lotSize", 1001)).toEqual({
      type: "ERROR_RESULT",
      errorMessage: "max valid value for lotSize is 1,000",
    });
    expect(table.getRowAtKey("VOD.L")[columnMap.lotSize]).toBe(100);
  });

  test("the key column is not editable", () => {
    const { editCell } = setup();
    expect(editCell("ric", "BT.L")).toEqual({
      type: "ERROR_RESULT",
      errorMessage: "editCell: column ric is not editable",
    });
  });
});
