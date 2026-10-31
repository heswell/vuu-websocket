import { defineConfig } from "@rslib/core";

const distRoot = "../../dist/vuu-server";
const dts = { distPath: `${distRoot}/src` };

export default defineConfig({
  lib: [
    {
      dts,
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
    {
      // No Node or Bun dependencies: runs in a browser or Web Worker.
      dts,
      format: "esm",
      output: {
        cleanDistPath: false,
        distPath: { root: distRoot },
        target: "web",
      },
      source: {
        entry: {
          browser: "./src/browser.ts",
        },
      },
    },
  ],
});
