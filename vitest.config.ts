import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@cubism/shared-types": resolve("packages/shared-types/src/index.ts"),
      "@cubism/live2d-core": resolve("packages/live2d-core/src/index.ts"),
      "@cubism/conversation-core": resolve("packages/conversation-core/src/index.ts"),
      "@cubism/codex-client": resolve("packages/codex-client/src/index.ts"),
      "@cubism/storage": resolve("packages/storage/src/db.ts")
    }
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node"
  }
});
