import { describe, expect, test } from "bun:test";
import { OutboundRowPublishQueue } from "../src/util/PublishQueue";
import { ViewPortUpdate, type Viewport } from "../src/viewport/Viewport";
import { DefaultMessageHandler } from "../src/net/ClientConnectionCreator";
import type { Channel } from "../src/net/ws/Channel";
import type { FlowController } from "../src/net/flowcontrol/FlowController";
import { VuuUser } from "../src/core/auths/VuuUser";

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
    index,
    "ROW",
    -1,
    `key-${index}`,
    0,
    [`key-${index}`, value],
  );

const sizeUpdate = (viewport: Viewport, size: number) =>
  ViewPortUpdate("req-1", viewport, null, -1, "SIZE", size, "SIZE");

const values = (updates: ViewPortUpdate[]) =>
  updates.map((u) =>
    u.vpUpdate === "SIZE"
      ? `size:${u.size}`
      : `${u.vp.id}:${u.index}:${u.data[1]}`,
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

describe("DefaultMessageHandler outbound formatting", () => {
  const sendAll = (queue: OutboundRowPublishQueue) => {
    const sent: string[] = [];
    const channel = { send: (msg: string) => sent.push(msg) } as unknown as Channel;
    const flowController = {
      process() {},
      shouldSend: () => ({ type: "BATCHSIZE", size: 300 }),
    } as unknown as FlowController;
    const handler = DefaultMessageHandler(
      channel,
      queue,
      VuuUser("test"),
      { sessionId: "s1", channelId: "c1" } as never,
      {} as never,
      flowController,
      {} as never,
      {} as never,
    );
    handler.sendUpdates();
    return sent.map((json) => JSON.parse(json).body.rows) as {
      rowIndex: number;
      updateType: string;
      vpSize: number;
    }[][];
  };

  test("every update carries the viewport's current size, even after in-place merging", () => {
    const queue = new OutboundRowPublishQueue();
    const viewport = {
      id: "vp1",
      requestId: "req-1",
      size: 100,
      range: { from: 0, to: 200 },
    } as unknown as Viewport & { size: number };
    // first flush: size 100, rows 5 and 7
    queue.pushHighPriority(sizeUpdate(viewport, 100));
    queue.pushHighPriority(rowUpdate(viewport, 5, 1));
    queue.pushHighPriority(rowUpdate(viewport, 7, 1));
    // second flush: size grows to 120, row 5 changes again (merged in place)
    viewport.size = 120;
    queue.pushHighPriority(sizeUpdate(viewport, 120));
    queue.pushHighPriority(rowUpdate(viewport, 5, 2));

    const [rows] = sendAll(queue);
    expect(rows.map((r) => r.vpSize)).toEqual([120, 120, 120]);
  });

  test("row updates beyond the viewport's current size are dropped", () => {
    const queue = new OutboundRowPublishQueue();
    const viewport = {
      id: "vp1",
      requestId: "req-1",
      size: 100,
      range: { from: 0, to: 200 },
    } as unknown as Viewport & { size: number };
    queue.pushHighPriority(rowUpdate(viewport, 5, 1));
    queue.pushHighPriority(rowUpdate(viewport, 50, 1));
    viewport.size = 10;
    queue.pushHighPriority(sizeUpdate(viewport, 10));

    const [rows] = sendAll(queue);
    expect(rows.map((r) => [r.updateType, r.rowIndex, r.vpSize])).toEqual([
      ["U", 5, 10],
      ["SIZE", -1, 10],
    ]);
  });
});
