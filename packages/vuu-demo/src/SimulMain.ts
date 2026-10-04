import {
  ConfigFactory,
  createConfiguredAuthProviders,
  createVuuServerApplication,
} from "@heswell/vuu-server";
import { PricesModule } from "./modules/prices";
import { SimulationModule } from "./modules/simul";
import { SimulatedNotificationsModule } from "./modules/notifications";
// import { OrdersModule } from "./modules/orders";
// import { TestModule } from "./modules/test/TestModule";
// import { EditableModule } from "./modules/editable";
// import { PermissionModule } from "./modules/permission";
// import { BasketModule } from "./modules/baskets";

export default async function main() {
  const config = ConfigFactory.load();
  const application = createVuuServerApplication({
    authProviders: createConfiguredAuthProviders(config),
    config,
    defaultHttpsPort: 8443,
    defaultWebSocketPort: 8091,
    modules: [
      PricesModule(),
      SimulationModule(),
      SimulatedNotificationsModule(),
    ],
  });

  await application.start();
}
