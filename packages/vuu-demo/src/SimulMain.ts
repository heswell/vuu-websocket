import { VuuServerConfig, VuuServer } from "@heswell/vuu-server";
import { PricesModule } from "./modules/prices";
import { OrdersModule } from "./modules/orders";
import { SimulationModule } from "./modules/simul";
import { TestModule } from "./modules/test/TestModule";
import { LoginTokenService } from "@heswell/vuu-server/src/net/auth/LoginTokenService";
// import { EditableModule } from "./modules/editable";
// import { PermissionModule } from "./modules/permission";
// import { BasketModule } from "./modules/baskets";
import path from "path";

const certPath = path.join(import.meta.dir, "../certs");

export default function main() {
  const httpServerOptions = {};
  const webSocketOptions = {
    certPath,
    webSocketPort: process.env.WEBSOCKET_PORT ?? 8091,
  };

  const loginTokenService = LoginTokenService();

  const config = VuuServerConfig(
    httpServerOptions,
    webSocketOptions,
    loginTokenService,
  )
    .withModule(PricesModule())
    .withModule(SimulationModule());
  // .withModule(TestModule());
  // .withModule(EditableModule())
  // .withModule(PermissionModule())
  // .withModule(BasketModule());

  const vuuServer = new VuuServer(config);
}
