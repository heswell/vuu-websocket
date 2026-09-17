import { defineConfig } from "@rslib/core";

export default defineConfig({
  lib: [
    {
      dts: true,
      format: "esm",
      output: {
        cleanDistPath: true,
        distPath: {
          root: "../../dist/module-admin",
        },
      },
      source: {
        entry: {
          index: "./src/index.ts",
          "contracts/index": "./src/contracts/index.ts",
        },
      },
    },
  ],
  output: {
    target: "web",
  },
});
