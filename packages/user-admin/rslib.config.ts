import { defineConfig } from "@rslib/core";

export default defineConfig({
  lib: [
    {
      dts: true,
      format: "esm",
      output: {
        cleanDistPath: true,
        distPath: {
          root: "../../dist/user-admin",
        },
      },
      source: {
        entry: {
          index: "./src/index.ts",
          "contracts/index": "./src/contracts/index.ts",
          "in-memory/index": "./src/in-memory/index.ts",
        },
      },
    },
  ],
  output: {
    target: "web",
  },
});
