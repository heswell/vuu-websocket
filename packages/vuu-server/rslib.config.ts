import { defineConfig } from "@rslib/core";

export default defineConfig({
  lib: [
    {
      dts: {
        distPath: "../../dist/vuu-server/src",
      },
      format: "esm",
      output: {
        cleanDistPath: true,
        distPath: {
          root: "../../dist/vuu-server",
        },
      },
      source: {
        entry: {
          index: "./src/index.ts",
        },
      },
    },
  ],
  output: {
    target: "node",
  },
});
