import { describe, expect, test } from "bun:test";
import { VuuTable } from "@vuu-ui/vuu-protocol-types";

if (!(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const buildContext = (requestId: string) =>
  ({
    requestId,
    session: { sessionId: "sess-1", channelId: "chan-1" },
    user: { name: "test-user", expiry: new Date(), authorizations: [] },
    queue: {},
  }) as any;

const createHandler = async (tableContainer: any) => {
  const { CoreServerApiHandler } =
    await import("../src/core/CoreServerApiHandler");
  return new CoreServerApiHandler({} as any, tableContainer, {} as any);
};

describe("CoreServerApiHandler GET_TABLE_LIST", () => {
  test("returns TABLE_LIST_RESP with all defined tables", async () => {
    const tables: VuuTable[] = [{ module: "TEST", table: "instruments" }];
    const tableContainer = {
      getDefinedTables: () => tables,
    };
    const handler = await createHandler(tableContainer);

    const response = await handler.process(
      {
        requestId: "req-1",
        sessionId: "sess-1",
        body: { type: "GET_TABLE_LIST" },
      } as any,
      buildContext("req-1"),
    );

    expect(response).toEqual({
      body: {
        type: "TABLE_LIST_RESP",
        tables,
      },
      module: "CORE",
      requestId: "req-1",
      sessionId: "sess-1",
    });
  });

  describe("CoreServerApiHandler REMOVE_VP", () => {
    test("returns REMOVE_VP_SUCCESS after removing the viewport", async () => {
      let removedViewportId: string | undefined;
      const tableContainer = {};
      const viewPortContainer = {
        removeViewport: (viewPortId: string) => {
          removedViewportId = viewPortId;
        },
      };
      const { CoreServerApiHandler } =
        await import("../src/core/CoreServerApiHandler");
      const handler = new CoreServerApiHandler(
        viewPortContainer as any,
        tableContainer as any,
        {} as any,
      );

      const response = await handler.process(
        {
          requestId: "req-remove-1",
          sessionId: "sess-1",
          body: { type: "REMOVE_VP", viewPortId: "vp-1" },
        } as any,
        buildContext("req-remove-1"),
      );

      expect(removedViewportId).toBe("vp-1");
      expect(response).toEqual({
        body: {
          type: "REMOVE_VP_SUCCESS",
          viewPortId: "vp-1",
        },
        module: "CORE",
        requestId: "req-remove-1",
        sessionId: "sess-1",
      });
    });

    test("returns ERROR when the viewport does not exist", async () => {
      const tableContainer = {};
      const viewPortContainer = {
        removeViewport: () => {
          throw new Error("viewport not found");
        },
      };
      const { CoreServerApiHandler } =
        await import("../src/core/CoreServerApiHandler");
      const handler = new CoreServerApiHandler(
        viewPortContainer as any,
        tableContainer as any,
        {} as any,
      );

      const response = await handler.process(
        {
          requestId: "req-remove-1",
          sessionId: "sess-1",
          body: { type: "REMOVE_VP", viewPortId: "missing-vp" },
        } as any,
        buildContext("req-remove-1"),
      );

      expect(response).toEqual({
        body: {
          type: "ERROR",
          msg: "Failed to process request req-remove-1",
        },
        module: "CORE",
        requestId: "req-remove-1",
        sessionId: "sess-1",
      });
    });
  });

  describe("CoreServerApiHandler CHANGE_VP", () => {
    const changeRequest = {
      type: "CHANGE_VP",
      viewPortId: "vp-1",
      aggregations: [],
      columns: ["ccy", "price"],
      filterSpec: { filter: "" },
      groupBy: ["ccy"],
      sort: { sortDefs: [] },
    };

    test("applies the change and returns CHANGE_VP_SUCCESS", async () => {
      let changedWith: unknown;
      const viewPortContainer = {
        getViewportById: () => ({
          changeViewport: (options: unknown) => {
            changedWith = options;
          },
        }),
      };
      const { CoreServerApiHandler } =
        await import("../src/core/CoreServerApiHandler");
      const handler = new CoreServerApiHandler(
        viewPortContainer as any,
        {} as any,
        {} as any,
      );

      const response = await handler.process(
        {
          requestId: "req-change-1",
          sessionId: "sess-1",
          body: changeRequest,
        } as any,
        buildContext("req-change-1"),
      );

      const { type: _, viewPortId: __, ...options } = changeRequest;
      expect(changedWith).toMatchObject(options);
      expect(response).toEqual({
        body: { ...changeRequest, type: "CHANGE_VP_SUCCESS" },
        module: "CORE",
        requestId: "req-change-1",
        sessionId: "sess-1",
      });
    });

    test("returns ERROR when the viewport does not exist", async () => {
      const viewPortContainer = {
        getViewportById: () => {
          throw new Error("no viewport");
        },
      };
      const { CoreServerApiHandler } =
        await import("../src/core/CoreServerApiHandler");
      const handler = new CoreServerApiHandler(
        viewPortContainer as any,
        {} as any,
        {} as any,
      );

      const response = (await handler.process(
        {
          requestId: "req-change-2",
          sessionId: "sess-1",
          body: changeRequest,
        } as any,
        buildContext("req-change-2"),
      )) as any;

      expect(response.body.type).toBe("ERROR");
      expect(response.requestId).toBe("req-change-2");
    });
  });

  describe("CoreServerApiHandler selection", () => {
    const processSelectAll = async (viewPortContainer: any) => {
      const { CoreServerApiHandler } =
        await import("../src/core/CoreServerApiHandler");
      const handler = new CoreServerApiHandler(
        viewPortContainer,
        {} as any,
        {} as any,
      );
      return handler.process(
        {
          requestId: "req-select-all",
          sessionId: "sess-1",
          body: { type: "SELECT_ALL", vpId: "vp-1" },
        } as any,
        buildContext("req-select-all"),
      );
    };

    test("handles SELECT_ALL and returns SELECT_ALL_SUCCESS", async () => {
      let selectedViewportId: string | undefined;
      const response = await processSelectAll({
        selectAll: (viewPortId: string) => {
          selectedViewportId = viewPortId;
          return 42;
        },
      });
      expect(selectedViewportId).toBe("vp-1");
      expect(response).toEqual({
        body: {
          selectedRowCount: 42,
          type: "SELECT_ALL_SUCCESS",
          vpId: "vp-1",
        },
        module: "CORE",
        requestId: "req-select-all",
        sessionId: "sess-1",
      });
    });

    test("returns SELECT_ALL_REJECT when select all fails", async () => {
      const response = await processSelectAll({
        selectAll: () => {
          throw Error("no such viewport");
        },
      });
      expect(response?.body).toEqual({
        errorMsg: "Failed to process request req-select-all",
        type: "SELECT_ALL_REJECT",
        vpId: "vp-1",
      });
    });

    test("handles DESELECT_ALL and returns DESELECT_ALL_SUCCESS", async () => {
      let deselectedViewportId: string | undefined;
      const tableContainer = {};
      const viewPortContainer = {
        deselectAll: (viewPortId: string) => {
          deselectedViewportId = viewPortId;
          return 0;
        },
      };
      const { CoreServerApiHandler } =
        await import("../src/core/CoreServerApiHandler");
      const handler = new CoreServerApiHandler(
        viewPortContainer as any,
        tableContainer as any,
        {} as any,
      );

      const response = await handler.process(
        {
          requestId: "req-select-1",
          sessionId: "sess-1",
          body: { type: "DESELECT_ALL", vpId: "vp-1" },
        } as any,
        buildContext("req-select-1"),
      );

      expect(deselectedViewportId).toBe("vp-1");
      expect(response).toEqual({
        body: {
          type: "DESELECT_ALL_SUCCESS",
          vpId: "vp-1",
        },
        module: "CORE",
        requestId: "req-select-1",
        sessionId: "sess-1",
      });
    });
  });

  test("returns ERROR when table lookup fails", async () => {
    const tableContainer = {
      getDefinedTables: () => {
        throw new Error("boom");
      },
    };
    const handler = await createHandler(tableContainer);

    const response = await handler.process(
      {
        requestId: "req-2",
        sessionId: "sess-1",
        body: { type: "GET_TABLE_LIST" },
      } as any,
      buildContext("req-2"),
    );

    expect(response).toEqual({
      body: {
        type: "ERROR",
        msg: "Failed to process request req-2",
      },
      module: "CORE",
      requestId: "req-2",
      sessionId: "sess-1",
    });
  });
});
