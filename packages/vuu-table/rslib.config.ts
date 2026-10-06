import { defineConfig } from "@rslib/core";

export default defineConfig({
  lib: [
    {
      dts: true,
      format: "esm",
      output: {
        cleanDistPath: true,
        distPath: {
          root: "../../dist/vuu-table",
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
    target: "web",
  },
});
