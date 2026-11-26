import { describe, expect, test } from "bun:test";
import { Columns, TableDef, VuuUser } from "@heswell/vuu-server";
import type { VuuViewportCreateRequest } from "@vuu-ui/vuu-protocol-types";
import { InMemDataTable } from "../src/core/table/InMemDataTable";
import { TableContainer } from "../src/core/table/TableContainer";
import type { ViewServerModule } from "../src/core/module/VsModule";
import { CreateViewPortSuccess } from "../src/net/Messages";
import { isClientRequestError } from "../src/net/ClientRequestError";
import { JoinTableProvider } from "../src/provider/JoinTableProvider";
import type { ProviderContainer } from "../src/provider/ProviderContainer";
import { OutboundRowPublishQueue } from "../src/util/PublishQueue";
import {
  flushViewports,
  isViewPortRowUpdate,
  type ViewPortUpdate,
} from "../src/viewport/Viewport";
import { ViewportContainer } from "../src/viewport/ViewportContainer";
import type { WithTree } from "../src/viewport/ViewportTree";

const setup = () => {
  const tableDef = TableDef({
    name: "limits",
    keyField: "id",
    columns: Columns.fromNames(
      "id:string",
      "parentId:string",
      "name:string",
      "limit:int",
    ),
  });
  tableDef.setModule({ name: "TEST" } as ViewServerModule);
  const limits = new InMemDataTable(tableDef, new JoinTableProvider());
  limits.insert(["firm", "", "Firm", 100]);
  limits.insert(["le1", "firm", "Legal entity 1", 50]);
  limits.insert(["desk1", "le1", "Desk 1", 20]);
  limits.insert(["le2", "firm", "Legal entity 2", 70]);

  const tableContainer = new TableContainer(new JoinTableProvider());
  tableContainer.addTable(limits);
  const viewportContainer = new ViewportContainer(
    tableContainer,
    {} as ProviderContainer,
  );
  const queue = new OutboundRowPublishQueue();
  const session = { sessionId: "session-1", channelId: "channel-1" };

  const createRequest = (
    request: Partial<WithTree<VuuViewportCreateRequest>> = {},
  ): WithTree<VuuViewportCreateRequest> => ({
    type: "CREATE_VP",
    table: limits.tableDef.asVuuTable,
    aggregations: [],
    columns: ["name", "limit"],
    filterSpec: { filter: "" },
    groupBy: [],
    range: { from: 0, to: 100 },
    sort: { sortDefs: [] },
    tree: { parentColumn: "parentId", openDepth: 1 },
    ...request,
  });

  const createViewport = (
    request: Partial<WithTree<VuuViewportCreateRequest>> = {},
  ) => {
    const vp = viewportContainer.create(
      "req-1",
      VuuUser("steve"),
      session,
      queue,
      limits,
      createRequest(request),
    );
    vp.postDataForCurrentRange();
    return vp;
  };

  const rowUpdates = () =>
    (queue.popUpTo(1000) as ViewPortUpdate[])
      .filter(isViewPortRowUpdate)
      .map(({ index, rowKey, data }) => [index, rowKey, data]);

  return {
    createRequest,
    createViewport,
    limits,
    rowUpdates,
    session,
    viewportContainer,
  };
};

const refusal = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return isClientRequestError(error) ? error.reason : error;
  }
  return undefined;
};

describe("Viewport (server) parent-key tree", () => {
  test("rows carry the tree prefix, keyed by the table key", () => {
    const { createViewport, rowUpdates } = setup();
    const vp = createViewport();
    expect(vp.size).toBe(3);
    expect(rowUpdates()).toEqual([
      [0, "firm", [1, true, "firm", false, "firm", 2, "Firm", 100]],
      [1, "le1", [2, false, "le1", false, "le1", 1, "Legal entity 1", 50]],
      [2, "le2", [2, false, "le2", true, "le2", 0, "Legal entity 2", 70]],
    ]);
  });

  test("OPEN_TREE_NODE and CLOSE_TREE_NODE take the table key", () => {
    const { createViewport, rowUpdates, session, viewportContainer } = setup();
    const vp = createViewport();
    rowUpdates();
    viewportContainer.openTreeNode(vp.id, "le1", session);
    expect(rowUpdates().map(([index, rowKey]) => [index, rowKey])).toEqual([
      [1, "le1"],
      [2, "desk1"],
      [3, "le2"],
    ]);
    viewportContainer.closeTreeNode(vp.id, "firm", session);
    expect(vp.size).toBe(1);
  });

  test("an edited row is re-sent in place", () => {
    const { createViewport, limits, rowUpdates } = setup();
    createViewport();
    rowUpdates();
    limits.processUpdate("le1", ["le1", "firm", "Legal entity 1", 55]);
    flushViewports();
    expect(rowUpdates()).toEqual([
      [1, "le1", [2, false, "le1", false, "le1", 1, "Legal entity 1", 55]],
    ]);
  });

  test("selection is by table key", () => {
    const { createViewport } = setup();
    const vp = createViewport();
    vp.selectRow("le1", false);
    expect([...vp.selectedKeys]).toEqual(["le1"]);
  });

  test("CHANGE_VP without tree makes the viewport flat; with tree, a tree again", () => {
    const { createViewport, rowUpdates } = setup();
    const vp = createViewport();
    vp.changeViewport({ columns: ["name"], groupBy: [] });
    expect(vp.size).toBe(4);
    expect(rowUpdates().at(-1)).toEqual([3, "le2", ["Legal entity 2"]]);
    vp.changeViewport({
      columns: ["name"],
      groupBy: [],
      tree: { parentColumn: "parentId" },
    });
    expect(vp.size).toBe(1);
  });

  test("an invalid tree is refused", () => {
    const { createViewport } = setup();
    expect(
      refusal(() => createViewport({ tree: { parentColumn: "nope" } })),
    ).toBe("tree parentColumn nope is not a column of limits");
    expect(
      refusal(() => createViewport({ tree: { parentColumn: "limit" } })),
    ).toBe("tree parentColumn limit must have the data type of key column id");
    expect(refusal(() => createViewport({ groupBy: ["parentId"] }))).toBe(
      "tree cannot be combined with groupBy",
    );
    const vp = createViewport({ tree: undefined });
    expect(
      refusal(() =>
        vp.changeViewport({
          aggregations: [{ column: "limit", aggType: 1 }],
          tree: { parentColumn: "parentId" },
        }),
      ),
    ).toBe("tree cannot be combined with aggregations");
  });

  test("CREATE_VP_SUCCESS echoes tree when requested", () => {
    const { createRequest } = setup();
    expect(
      CreateViewPortSuccess("vp1", "limits", createRequest()).tree,
    ).toEqual({ parentColumn: "parentId", openDepth: 1 });
    expect(
      "tree" in
        CreateViewPortSuccess(
          "vp1",
          "limits",
          createRequest({ tree: undefined }),
        ),
    ).toBe(false);
  });
});
