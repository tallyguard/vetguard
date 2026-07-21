import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/setup/no-network.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/cli.ts"],
    },
  },
});
