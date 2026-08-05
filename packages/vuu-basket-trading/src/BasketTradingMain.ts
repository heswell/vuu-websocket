import {
  ConfigFactory,
  createVuuServerApplication,
  KeycloakAuthProvider,
} from "@heswell/vuu-server";
import { BasketModule } from "./modules/basket/BasketModule";

export default async function main() {
  const config = ConfigFactory.load();
  const authProvider = new KeycloakAuthProvider(config);
  const application = createVuuServerApplication({
    authProviders: { bearerToken: authProvider },
    config,
    defaultHttpsPort: 8445,
    defaultWebSocketPort: 8093,
    modules: [BasketModule()],
  });

  await application.start();
}
