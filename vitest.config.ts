import { configDefaults, defineConfig } from "vitest/config";

// Agent worktrees live under .claude/ inside the repo folder; their tests belong to other branches.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, ".claude/**"] },
});
