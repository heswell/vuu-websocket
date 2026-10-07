// React rendering and @vuu-ui/vuu-layout (loaded via @vuu-ui/vuu-data-test)
// need a DOM; vitest supplied one via happy-dom. Bun evaluates this module once
// per process, so registration at load covers imports, and each test file
// calls withHappyDom() to keep the DOM for its tests and remove it afterwards,
// leaving other test files in the same bun process with a plain runtime.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll } from "bun:test";

const register = () => {
  if (!GlobalRegistrator.isRegistered) {
    GlobalRegistrator.register();
  }
};

register();

export const withHappyDom = () => {
  beforeAll(register);
  afterAll(async () => {
    if (GlobalRegistrator.isRegistered) {
      await GlobalRegistrator.unregister();
    }
  });
};
