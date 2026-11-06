// Search keys that do not care how the word was typed: full/half width (NFKC), upper/lower case,
// and hiragana or katakana ("かろな" finds カロナール).

/** ぁ (U+3041) … ゖ (U+3096) → ァ … ヶ; ゝゞ → ヽヾ. */
export function toKatakana(s: string): string {
  return s.replace(/[ぁ-ゖゝゞ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

const normalised = new Map<string, string>();
export function searchKey(s: string): string {
  const cached = normalised.get(s);
  if (cached !== undefined) return cached;
  const key = toKatakana(s.normalize("NFKC").toLowerCase()).replace(/\s+/g, "");
  if (normalised.size >= 16384) normalised.clear();
  normalised.set(s, key);
  return key;
}

/** Whether a word matches what was typed (from the start, or anywhere). */
export function kanaMatch(word: string, typed: string, prefix = false): boolean {
  const w = searchKey(word);
  const q = searchKey(typed);
  return q.length > 0 && (prefix ? w.startsWith(q) : w.includes(q));
}
