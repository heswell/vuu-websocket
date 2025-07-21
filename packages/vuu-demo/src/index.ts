import {
  VuuServerConfig,
  VuuServer,
  TypeAheadModule,
} from "@heswell/vuu-server";
import { PricesModule } from "./modules/prices";
import { OrdersModule } from "./modules/orders";
import { SimulationModule } from "./modules/simul";
// import { EditableModule } from "./modules/editable";
// import { PermissionModule } from "./modules/permission";
// import { BasketModule } from "./modules/baskets";

export default function start() {
  const httpServerOptions = {};
  const webSocketOptions = {
    webSocketPort: process.env.WEBSOCKET_PORT ?? 8091,
  };

  const config = VuuServerConfig(httpServerOptions, webSocketOptions)
    .withModule(PricesModule())
    .withModule(SimulationModule())
    .withModule(OrdersModule())
    .withModule(TypeAheadModule());
  // .withModule(EditableModule())
  // .withModule(PermissionModule())
  // .withModule(BasketModule());

  const vuuServer = new VuuServer(config);

  vuuServer.start();
}
