import { defineConfig } from "@rslib/core";

const distRoot = "../../dist/vuu-server-node";

export default defineConfig({
  lib: [
    {
      dts: { distPath: `${distRoot}/src` },
      format: "esm",
      output: {
        cleanDistPath: true,
        distPath: { root: distRoot },
        target: "node",
      },
      source: {
        entry: {
          index: "./src/index.ts",
        },
      },
    },
  ],
});
