import { HttpRequestHandler } from "../../core/VuuServerOptions";

export function composeHttpHandlers(
  ...handlers: HttpRequestHandler[]
): HttpRequestHandler {
  return async (request, url) => {
    for (const handler of handlers) {
      const response = await handler(request, url);
      if (response) {
        return response;
      }
    }
    return undefined;
  };
}
