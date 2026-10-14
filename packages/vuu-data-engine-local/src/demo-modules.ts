import { BasketModule } from "./basket/BasketModule";
import { getDefaultEngine, type LocalEngine } from "./core/engine/LocalEngine";
import { SimulModule } from "./simul/SimulModule";
import { TestModule } from "./test/TestModule";

export type DemoModules = {
  simulModule: SimulModule;
  basketModule: BasketModule;
  testModule: TestModule;
};

/**
 * Create new SIMUL, BASKET and TEST demo modules and register them with an
 * engine (by default, the default engine used by LocalDataSourceProvider).
 * BASKET shares SIMUL's prices table. Prices tick only once a dataSource is
 * created; `engine.dispose()` stops all timers.
 *
 * Nothing is created or registered until this is called.
 */
export const registerDemoModules = (
  engine: LocalEngine = getDefaultEngine(),
): DemoModules => {
  const simulModule = new SimulModule();
  const basketModule = new BasketModule({ prices: simulModule.prices });
  const testModule = new TestModule();
  engine.register(simulModule);
  engine.register(basketModule);
  engine.register(testModule);
  return { simulModule, basketModule, testModule };
};
