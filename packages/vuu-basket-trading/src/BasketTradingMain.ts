import {
  ConfigFactory,
  createVuuServerApplication,
  KeycloakAuthProvider,
  NotificationModule,
  NullProvider,
  PermissionFilter,
  ViewPortDef,
} from "@heswell/vuu-server";
import { BasketModule } from "./modules/basket/BasketModule";

export default async function main() {
  const config = ConfigFactory.load();
  const authProvider = new KeycloakAuthProvider(config);
  const application = createVuuServerApplication({
    authProviders: { bearerToken: authProvider },
    config,
    defaultHttpsPort: 8445,
    defaultWebSocketPath: "/websocket-basket-trading",
    defaultWebSocketPort: 8093,
    modules: [
      BasketModule(),
      NotificationModule(
        (table) => new NullProvider(table),
        (viewport) =>
          PermissionFilter("audience", new Set(["all", viewport.user.name])),
        (table) => ViewPortDef.default(table.tableDef.columns),
      ),
    ],
  });

  await application.start();
}
