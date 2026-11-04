import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// Agent worktrees live under .claude/ inside the repo folder; their tests belong to other branches.
// Tests that read the large official masters (傷病名・医薬品・診療行為) can take over 5 s when the whole
// suite runs in parallel on a busy machine, so they get more time (they pass well within it alone).
// "@/" is src/ as in tsconfig.json, for tests that render components (which import that way).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { exclude: [...configDefaults.exclude, ".claude/**"], testTimeout: 30_000 },
});
