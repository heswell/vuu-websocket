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
  const { CoreServerApiHandler } = await import("../src/core/CoreServerApiHandler");
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

  describe("CoreServerApiHandler selection", () => {
    test("handles DESELECT_ALL and returns DESELECT_ALL_SUCCESS", async () => {
      let deselectedViewportId: string | undefined;
      const tableContainer = {};
      const viewPortContainer = {
        deselectAll: (viewPortId: string) => {
          deselectedViewportId = viewPortId;
          return 0;
        },
      };
      const { CoreServerApiHandler } = await import("../src/core/CoreServerApiHandler");
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
