import { defineConfig } from "vitest/config";

// Tests run under bun test; vitest is used only for the legacy comparison bench.
export default defineConfig({
  test: {
    benchmark: {
      include: ["bench/**/*.bench.ts"],
    },
    environment: "happy-dom",
    server: {
      deps: {
        // @heswell engine and @vuu-ui packages ship typescript source or ESM
        // that must be transformed by vite rather than loaded by node.
        inline: [/@heswell\//, /@vuu-ui\//],
      },
    },
  },
});
