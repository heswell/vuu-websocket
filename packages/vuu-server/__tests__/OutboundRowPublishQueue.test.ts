import { describe, expect, test } from "bun:test";
import { OutboundRowPublishQueue } from "../src/util/PublishQueue";
import {
  ViewPortUpdate,
  type Viewport,
  type ViewPortRowUpdate,
} from "../src/viewport/Viewport";
import { RowKeyUpdate } from "../src/core/table/InMemDataTable";

const vp = (id: string) => ({ id, requestId: "req-1" }) as unknown as Viewport;

const rowUpdate = (
  viewport: Viewport,
  index: number,
  value: number,
  requestId = "req-1",
) =>
  ViewPortUpdate(
    requestId,
    viewport,
    null,
    RowKeyUpdate(`key-${index}`, null),
    index,
    "ROW",
    100,
    0,
    {
      rowIndex: index,
      rowKey: `key-${index}`,
      sel: 0,
      ts: 0,
      data: [`key-${index}`, value],
    },
  );

const sizeUpdate = (viewport: Viewport, size: number) =>
  ViewPortUpdate(
    "req-1",
    viewport,
    null,
    RowKeyUpdate("SIZE", null),
    -1,
    "SIZE",
    size,
    0,
  );

const values = (updates: ViewPortUpdate[]) =>
  updates.map((u) =>
    u.vpUpdate === "SIZE"
      ? `size:${u.size}`
      : `${u.vp.id}:${u.index}:${(u as ViewPortRowUpdate).row.data[1]}`,
  );

describe("OutboundRowPublishQueue", () => {
  test("a newer update for the same viewport row replaces the pending one in place", () => {
    const queue = new OutboundRowPublishQueue();
    const vp1 = vp("vp1");
    queue.pushHighPriority(rowUpdate(vp1, 0, 1));
    queue.pushHighPriority(rowUpdate(vp1, 1, 1));
    queue.pushHighPriority(rowUpdate(vp1, 0, 2));
    queue.pushHighPriority(rowUpdate(vp1, 0, 3, "req-2"));
    expect(queue.length).toBe(2);
    const updates = queue.popUpTo(10);
    expect(values(updates)).toEqual(["vp1:0:3", "vp1:1:1"]);
    expect(updates[0].vpRequestId).toBe("req-2");
    expect(queue.isEmpty()).toBe(true);
  });

  test("updates for different viewports are not merged", () => {
    const queue = new OutboundRowPublishQueue();
    const [vp1, vp2] = [vp("vp1"), vp("vp2")];
    queue.pushHighPriority(rowUpdate(vp1, 0, 1));
    queue.pushHighPriority(rowUpdate(vp2, 0, 1));
    queue.pushHighPriority(rowUpdate(vp2, 0, 2));
    expect(values(queue.popUpTo(10))).toEqual(["vp1:0:1", "vp2:0:2"]);
  });

  test("SIZE updates for the same viewport are merged", () => {
    const queue = new OutboundRowPublishQueue();
    const vp1 = vp("vp1");
    queue.pushHighPriority(sizeUpdate(vp1, 10));
    queue.pushHighPriority(rowUpdate(vp1, 0, 1));
    queue.pushHighPriority(sizeUpdate(vp1, 20));
    expect(values(queue.popUpTo(10))).toEqual(["size:20", "vp1:0:1"]);
  });

  test("once dequeued, an update is no longer merged into", () => {
    const queue = new OutboundRowPublishQueue();
    const vp1 = vp("vp1");
    queue.pushHighPriority(rowUpdate(vp1, 0, 1));
    queue.pushHighPriority(rowUpdate(vp1, 1, 1));
    const first = queue.popUpTo(1);
    queue.pushHighPriority(rowUpdate(vp1, 0, 2));
    queue.pushHighPriority(rowUpdate(vp1, 1, 2));
    expect(values(first)).toEqual(["vp1:0:1"]);
    expect(values(queue.popUpTo(10))).toEqual(["vp1:1:2", "vp1:0:2"]);
  });

  test("pop and popUpTo drain high priority entries first", () => {
    const queue = new OutboundRowPublishQueue();
    const vp1 = vp("vp1");
    queue.push(rowUpdate(vp1, 5, 1));
    queue.pushHighPriority(rowUpdate(vp1, 0, 1));
    queue.pushHighPriority(rowUpdate(vp1, 1, 1));
    expect(values([queue.pop()!])).toEqual(["vp1:0:1"]);
    expect(values(queue.popUpTo(10))).toEqual(["vp1:1:1", "vp1:5:1"]);
    expect(queue.length).toBe(0);
    expect(queue.popUpTo(10)).toEqual([]);
    expect(() => queue.pop()).toThrow();
  });
});
