import { defineConfig } from "@rslib/core";

export default defineConfig({
  lib: [
    {
      dts: {
        distPath: "../../dist/service-utils/src",
      },
      format: "esm",
      output: {
        cleanDistPath: true,
        distPath: {
          root: "../../dist/service-utils",
        },
      },
      source: {
        entry: {
          index: "./src/index.ts",
          browser: "./src/browser.ts",
        },
      },
    },
  ],
  output: {
    target: "node",
  },
});
