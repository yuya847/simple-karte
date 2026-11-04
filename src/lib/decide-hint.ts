// The sentence next to a disabled 「決める」 button: what is still missing and how to fill it, so the reason
// is on the screen (not only in the tooltip).

/** Things that are typed (not chosen from chips). */
const TYPED: ReadonlySet<string> = new Set(["量", "速度", "日数", "コメント"]);

/**
 * 「経路を選ぶと決められます」「量を入れて、経路と回数を選ぶと決められます」. Empty string when nothing is
 * missing. The order of `missing` is kept.
 */
export function decideHint(missing: string[]): string {
  const typed = missing.filter((m) => TYPED.has(m));
  const chosen = missing.filter((m) => !TYPED.has(m));
  if (!typed.length && !chosen.length) return "";
  const parts = [typed.length ? `${typed.join("と")}を入れ` : "", chosen.length ? `${chosen.join("と")}を選ぶ` : ""].filter(Boolean);
  if (parts.length === 2) return `${parts[0]}て、${parts[1]}と決められます`;
  return `${parts[0]}${typed.length ? "る" : ""}と決められます`;
}
