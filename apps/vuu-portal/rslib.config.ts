import { defineConfig } from "@rslib/core";

export default defineConfig({
  lib: [
    {
      dts: {
        distPath: "../../dist/vuu-portal/src",
      },
      format: "esm",
      output: {
        cleanDistPath: true,
        distPath: {
          root: "../../dist/vuu-portal",
        },
      },
      source: {
        entry: {
          index: "./src/index.ts",
          main: "./src/main.ts",
          bin: "./src/bin.ts",
        },
      },
    },
  ],
  output: {
    target: "node",
  },
});
