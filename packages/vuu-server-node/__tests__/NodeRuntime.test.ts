// Runs the shared runtime contract against nodeRuntime. Under `bun test` this
// uses Bun's node:http and ws support; scripts/smoke-test-node-runtime.ts
// checks the built packages on Node itself.
import { nodeRuntime } from "../src";
import { describeServerRuntime } from "../../vuu-server/__tests__/runtime/serverRuntimeContract";

describeServerRuntime(nodeRuntime);
