import {
  httpServerOptions,
  webSocketOptions,
  VuuServerConfig,
  VuuServer,
  HttpServerOptions,
  TypeAheadModule,
  WebSocketOptions,
} from "@heswell/vuu-server";
// import { PriceModule } from "./modules/prices";
import { OrdersModule } from "./modules/orders";
import { SimulationModule } from "./modules/simul";
// import { EditableModule } from "./modules/editable";
// import { PermissionModule } from "./modules/permission";
// import { BasketModule } from "./modules/baskets";

export default function start() {
  const defaultConfig: HttpServerOptions & WebSocketOptions = {
    websocketPort: process.env.WEBSOCKET_PORT ?? 8091,
  };

  const config = VuuServerConfig(
    httpServerOptions(defaultConfig),
    webSocketOptions(defaultConfig)
  )
    // .withModule(PriceModule())
    .withModule(SimulationModule())
    .withModule(OrdersModule())
    .withModule(TypeAheadModule());
  // .withModule(EditableModule())
  // .withModule(PermissionModule())
  // .withModule(BasketModule());

  const vuuServer = new VuuServer(config);

  vuuServer.start();
}
