import { type VuuServerConfig } from "./VuuServerOptions";
import { VuuServerCore } from "./VuuServerCore";
import { WebSocketServer } from "../net/ws/WebSocketServer";
import { RestServer } from "../net/http/RestServer";
import { LifecycleContainer } from "../toolbox/thread/LifecycleContainer";

/**
 * The Vuu server hosted on Bun: VuuServerCore plus a WebSocket server and,
 * when configured with a request handler, a REST server.
 */
export class VuuServer extends VuuServerCore {
  readonly #webSocketServer: WebSocketServer;
  readonly #restServer: RestServer | undefined;

  get webSocketPort() {
    return this.#webSocketServer.port;
  }

  /** Port the REST server is listening on, once started. */
  get restPort() {
    return this.#restServer?.port;
  }

  /** Base URL (http or https) of the REST server, once started. */
  get restUrl() {
    return this.#restServer?.url;
  }

  constructor(
    {
      httpServerOptions,
      loginSuccessProvider,
      loginTokenService,
      modules,
      webSocketOptions,
    }: VuuServerConfig,
    lifecycle: LifecycleContainer,
  ) {
    super(
      {
        loginSuccessProvider,
        loginTokenService,
        maxSessionsPerUser: webSocketOptions.maxSessionsPerUser,
        modules,
        sessionLimitPolicy: webSocketOptions.sessionLimitPolicy,
      },
      lifecycle,
    );

    this.#webSocketServer = new WebSocketServer(
      webSocketOptions,
      this.handlerFactory,
    );
    this.#restServer = httpServerOptions.requestHandler
      ? new RestServer(webSocketOptions, httpServerOptions)
      : undefined;
  }

  async doStart() {
    await super.doStart();
    this.#webSocketServer.start();
    this.#restServer?.start();
  }

  async doStop() {
    const errors: unknown[] = [];
    for (const stop of [
      () => this.#restServer?.stop(),
      () => this.#webSocketServer.stop(),
      () => super.doStop(),
    ]) {
      try {
        await stop();
      } catch (error: unknown) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "[VuuServer] stop failed");
    }
  }
}
