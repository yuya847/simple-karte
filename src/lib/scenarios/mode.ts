/** URL-scoped mode; separate workspace and display storage, with no changes to normal records. */
export function scenarioMode(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("scenarios") === "100";
}
// New fixture revision gets its own saved workspace; previous test edits remain stored.
export function scenarioStorageKey(key: string): string {
  return scenarioMode() ? `${key}:scenarios-100:v3` : key;
}
