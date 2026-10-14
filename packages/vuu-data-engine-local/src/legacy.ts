/**
 * @deprecated Backward compatible entry point. Importing it creates the
 * demo modules (SIMUL, BASKET, TEST, MODULE_ADMIN, USER_ADMIN and
 * NOTIFICATIONS) and registers them with the default engine, as importing
 * the main entry point did in 2.x. Prefer `registerDemoModules()` or
 * `createLocalEngine({ modules })` from "@heswell/vuu-data-engine-local".
 * Also re-exports the React bindings from "@heswell/vuu-data-engine-local/react".
 */
import { getDefaultEngine } from "./core/engine/LocalEngine";
import { registerDemoModules } from "./demo-modules";
import { ModuleAdminModule } from "./module-admin/ModuleAdminModule";
import { SimulatedNotificationsModule } from "./notifications/simulated/SimulatedNotificationsModule";
import { UserAdminModule } from "./user-admin/UserAdminModule";

export * from "./index";
export * from "./react";

const engine = getDefaultEngine();

/** @deprecated */
export const { simulModule, basketModule, testModule } =
  registerDemoModules(engine);
/** @deprecated */
export const moduleAdminModule = engine.register(new ModuleAdminModule());
/** @deprecated */
export const userAdminModule = engine.register(new UserAdminModule());
/** @deprecated */
export const notificationsModule = engine.register(
  SimulatedNotificationsModule(),
);
