import {
  VuuServerConfig,
  VuuServer,
  LifecycleContainer,
  VuuWebSocketOptions,
  ConfigFactory,
  Config,
  VuuSslByCertAndKey,
  LoginTokenService,
} from "@heswell/vuu-server";
import { PricesModule } from "./modules/prices";
import { OrdersModule } from "./modules/orders";
import { SimulationModule } from "./modules/simul";
import { TestModule } from "./modules/test/TestModule";
// import { EditableModule } from "./modules/editable";
// import { PermissionModule } from "./modules/permission";
// import { BasketModule } from "./modules/baskets";
import path from "path";

const certPath = path.join(import.meta.dir, "../certs");

export default async function main() {
  const httpServerOptions = {};
  const webSocketOptions = {
    certPath,
    webSocketPort: process.env.WEBSOCKET_PORT ?? 8091,
  };

  const loginTokenService = LoginTokenService();

  const defaultConfig = ConfigFactory.load();

  const lifecycle = new LifecycleContainer();

  const config = VuuServerConfig(
    createWebSocketOptions(defaultConfig),
    httpServerOptions,
    loginTokenService,
  )
    .withModule(PricesModule())
    .withModule(SimulationModule());
  // .withModule(TestModule());
  // .withModule(EditableModule())
  // .withModule(PermissionModule())
  // .withModule(BasketModule());

  new VuuServer(config, lifecycle);

  lifecycle.installShutdownHooks();
  await lifecycle.start();
}


const ConfigKeys  = {
   sslEnabled : "vuu.ssl",
   certPath : "vuu.certPath",
   keyPath : "vuu.keyPath",
   port: "vuu.port",
} as const;

function createWebSocketOptions(c: Config): VuuWebSocketOptions {
  const options = VuuWebSocketOptions()
      .withUri("websocket")
      .withWsPort(c.getNumber(ConfigKeys.port, 8091));

  if (c.getBoolean(ConfigKeys.sslEnabled)) {
    return options.withSsl(VuuSslByCertAndKey(c.getPath(ConfigKeys.certPath), c.getPath(ConfigKeys.keyPath)))
  } else {
    return options.withSslDisabled()
  }
}