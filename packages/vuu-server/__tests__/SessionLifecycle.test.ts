import { describe, expect, test } from "bun:test";
import type { VuuClientMessage } from "@vuu-ui/vuu-protocol-types";
import { VuuUser } from "../src/core/auths/VuuUser";
import type { ModuleContainer } from "../src/core/module/ModuleContainer";
import {
  ClientSessionId,
  DefaultMessageHandler,
  type MessageHandler,
} from "../src/net/ClientConnectionCreator";
import {
  ClientSessionContainer,
  SessionLimitError,
} from "../src/net/ClientSessionContainer";
import { VuuCloseCode } from "../src/net/CloseCodes";
import type { LoginTokenService } from "../src/net/auth/LoginTokenService";
import { FlowControllerFactory } from "../src/net/flowcontrol/FlowController";
import { RequestProcessor } from "../src/net/RequestProcessor";
import type { ServerApi } from "../src/net/ServerApi";
import type { Channel } from "../src/net/ws/Channel";
import { OutboundRowPublishQueue } from "../src/util/PublishQueue";

const steve = VuuUser("steve");

const fakeHandler = () => {
  const closes: Array<[number | undefined, string | undefined]> = [];
  const handler: MessageHandler = {
    handle: () => undefined,
    sendUpdates: () => {},
    close: (code, reason) => closes.push([code, reason]),
  };
  return { closes, handler };
};

const fakeChannel = (channelId: string) => {
  const sent: string[] = [];
  const closes: Array<[number | undefined, string | undefined]> = [];
  const channel = {
    data: { sessionId: channelId },
    send: (data: string) => sent.push(data),
    close: (code?: number, reason?: string) => closes.push([code, reason]),
  } as unknown as Channel;
  return { channel, closes, sent };
};

const message = (sessionId: string, type = "GET_TABLE_LIST") =>
  ({
    body: { type },
    module: "CORE",
    requestId: "r1",
    sessionId,
  }) as VuuClientMessage;

describe("ClientSessionContainer (trader upstream issue 72)", () => {
  test("evict-oldest closes the oldest session with SessionEvicted", () => {
    const container = ClientSessionContainer(1);
    const first = fakeHandler();
    const second = fakeHandler();
    container.register(steve, ClientSessionId("s1", "c1"), first.handler);
    container.register(steve, ClientSessionId("s2", "c2"), second.handler);

    expect(first.closes).toEqual([
      [VuuCloseCode.SessionEvicted, "session evicted: user logged in again"],
    ]);
    expect(second.closes).toEqual([]);
    expect(container.getSessions().map(({ sessionId }) => sessionId)).toEqual([
      "s2",
    ]);
    expect(container.getHandler(ClientSessionId("s1", "c1"))).toBeUndefined();
  });

  test("evicts only as many sessions as needed, oldest first", () => {
    const container = ClientSessionContainer(2);
    const handlers = [fakeHandler(), fakeHandler(), fakeHandler()];
    handlers.forEach(({ handler }, i) =>
      container.register(steve, ClientSessionId(`s${i}`, `c${i}`), handler),
    );
    expect(handlers.map(({ closes }) => closes.length)).toEqual([1, 0, 0]);
    container.register(
      VuuUser("alice"),
      ClientSessionId("a", "ca"),
      fakeHandler().handler,
    );
    expect(container.getSessions()).toHaveLength(3);
  });

  test("reject-new refuses the login and keeps the open session", () => {
    const container = ClientSessionContainer(1, "reject-new");
    const first = fakeHandler();
    container.register(steve, ClientSessionId("s1", "c1"), first.handler);
    expect(() =>
      container.register(
        steve,
        ClientSessionId("s2", "c2"),
        fakeHandler().handler,
      ),
    ).toThrow(SessionLimitError);
    expect(first.closes).toEqual([]);
    expect(container.getHandler(ClientSessionId("s1", "c1"))).toBe(
      first.handler,
    );
  });

  test("a session is only found on its own channel", () => {
    const container = ClientSessionContainer(1);
    const { handler } = fakeHandler();
    container.register(steve, ClientSessionId("s1", "c1"), handler);
    expect(container.getHandler(ClientSessionId("s1", "c1"))).toBe(handler);
    expect(container.getHandler(ClientSessionId("s1", "c2"))).toBeUndefined();
  });

  test("removeChannel tears down the channel's sessions", () => {
    const container = ClientSessionContainer(2);
    const a = fakeHandler();
    const b = fakeHandler();
    container.register(steve, ClientSessionId("s1", "c1"), a.handler);
    container.register(steve, ClientSessionId("s2", "c2"), b.handler);
    container.removeChannel("c1");
    expect(a.closes).toEqual([[undefined, undefined]]);
    expect(b.closes).toEqual([]);
    expect(container.getSessions().map(({ sessionId }) => sessionId)).toEqual([
      "s2",
    ]);
  });

  test("invalid limits are refused", () => {
    expect(() => ClientSessionContainer(0)).toThrow();
    expect(() => ClientSessionContainer(1, "nope" as never)).toThrow();
  });
});

describe("DefaultMessageHandler close (trader upstream issue 72)", () => {
  const setup = (process: ServerApi["process"] = () => undefined) => {
    const disconnects: string[] = [];
    const serverApi: ServerApi = {
      process,
      disconnect: ({ sessionId }) => disconnects.push(sessionId),
    };
    const { channel, closes } = fakeChannel("c1");
    const session = ClientSessionId("s1", "c1");
    const handler = DefaultMessageHandler(
      channel,
      new OutboundRowPublishQueue(),
      steve,
      session,
      serverApi,
      new FlowControllerFactory(false).create(session),
      ClientSessionContainer(1),
      {} as ModuleContainer,
    );
    return { closes, disconnects, handler };
  };

  test("removes the session state and closes the channel, once", () => {
    const { closes, disconnects, handler } = setup();
    handler.close?.(VuuCloseCode.SessionEvicted, "evicted");
    handler.close?.(VuuCloseCode.SessionEvicted, "evicted");
    expect(disconnects).toEqual(["s1"]);
    expect(closes).toEqual([[VuuCloseCode.SessionEvicted, "evicted"]]);
  });

  test("refuses messages once closed", async () => {
    const { handler } = setup();
    handler.close?.();
    expect(async () => handler.handle(message("s1"))).toThrow(
      "session s1 is closed",
    );
  });

  test("a request in flight when the session closes is cleaned up and not answered", async () => {
    const reply = Promise.withResolvers<undefined>();
    const { disconnects, handler } = setup(() => reply.promise);
    const pending = handler.handle(message("s1", "CREATE_VP"));
    handler.close?.();
    reply.resolve(undefined);
    expect(await pending).toBeUndefined();
    // once on close, again for anything the in-flight request created
    expect(disconnects).toEqual(["s1", "s1"]);
  });
});

describe("RequestProcessor (trader upstream issue 71)", () => {
  const setup = (handle: MessageHandler["handle"]) => {
    const container = ClientSessionContainer(1);
    container.register(steve, ClientSessionId("s1", "c1"), {
      handle,
      sendUpdates: () => {},
    });
    const processor = new RequestProcessor(
      {} as LoginTokenService,
      container,
      {} as ServerApi,
      {} as ModuleContainer,
      new FlowControllerFactory(false),
      "server",
    );
    return { container, processor, ...fakeChannel("c1") };
  };

  for (const [label, handle] of [
    [
      "throws",
      () => {
        throw Error("boom");
      },
    ],
    ["rejects", async () => Promise.reject(Error("boom"))],
  ] as const) {
    test(`a handler that ${label} is answered with ERROR, the channel stays open`, async () => {
      const { channel, closes, processor } = setup(handle);
      const response = await processor.handle(message("s1"), channel);
      expect(response).toEqual({
        requestId: "r1",
        sessionId: "s1",
        body: { type: "ERROR", msg: "Failed to process request r1" },
        module: "CORE",
      });
      expect(closes).toEqual([]);
    });
  }

  test("a message for an unknown session closes the channel with InvalidSession", async () => {
    const { channel, closes, processor, sent } = setup(() => undefined);
    await processor.handle(message("nope"), channel);
    expect(sent).toEqual(["Invalid session nope"]);
    expect(closes).toEqual([
      [VuuCloseCode.InvalidSession, "Invalid session nope"],
    ]);
  });

  test("channelClosed removes the channel's sessions", () => {
    const { channel, container, processor } = setup(() => undefined);
    processor.channelClosed(channel);
    expect(container.getSessions()).toEqual([]);
  });
});
