import { defineConfig } from "@rslib/core";

export default defineConfig({
  lib: [
    {
      dts: true,
      format: "esm",
      output: {
        cleanDistPath: true,
        distPath: {
          root: "../../dist/vuu-data-engine-local",
        },
      },
      source: {
        entry: {
          index: "./src/index.ts",
        },
        tsconfigPath: "./tsconfig.build.json",
      },
    },
  ],
  output: {
    target: "web",
  },
  tools: {
    swc: {
      jsc: {
        transform: {
          react: { runtime: "automatic" },
        },
      },
    },
  },
});
