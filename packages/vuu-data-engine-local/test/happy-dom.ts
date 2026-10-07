// React rendering needs a DOM; vitest supplied one via happy-dom. Register it
// only for the tests that import this file, and remove it afterwards so other
// test files in the same bun process keep a plain runtime.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll } from "bun:test";

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register();
  afterAll(() => GlobalRegistrator.unregister());
}
