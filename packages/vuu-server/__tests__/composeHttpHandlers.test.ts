import { describe, expect, test } from "bun:test";
import { HttpRequestHandler } from "../src/core/VuuServerOptions";
import { composeHttpHandlers } from "../src/net/http/composeHttpHandlers";

describe("composeHttpHandlers", () => {
  test("returns the first response and does not invoke later handlers", async () => {
    const calls: string[] = [];
    const first = handler("first", calls);
    const second = handler("second", calls, new Response("ok"));
    const third = handler("third", calls, new Response("unexpected"));
    const request = new Request("https://localhost/matched");

    const response = await composeHttpHandlers(first, second, third)(
      request,
      new URL(request.url),
    );

    expect(await response?.text()).toBe("ok");
    expect(calls).toEqual(["first", "second"]);
  });

  test("returns undefined when no handler owns the request", async () => {
    const request = new Request("https://localhost/unmatched");
    expect(
      await composeHttpHandlers(async () => undefined)(
        request,
        new URL(request.url),
      ),
    ).toBeUndefined();
  });
});

function handler(
  name: string,
  calls: string[],
  response?: Response,
): HttpRequestHandler {
  return () => {
    calls.push(name);
    return response;
  };
}
