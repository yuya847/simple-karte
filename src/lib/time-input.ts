/** 手入力の時刻を読む。24:00 は当日の終端を扱う欄だけで許可する。 */
export function normalizeTime(text: string, { allow24 = false }: { allow24?: boolean } = {}): string | null {
  const s = text.normalize("NFKC").trim();
  let h: number, m: number;
  const colon = s.match(/^(\d{1,2}):(\d{1,2})$/);
  const japanese = s.match(/^(\d{1,2})時(?:(\d{1,2})分?|半)?$/);
  if (colon) { h = Number(colon[1]); m = Number(colon[2]); }
  else if (japanese) { h = Number(japanese[1]); m = s.endsWith("半") ? 30 : Number(japanese[2] ?? 0); }
  else if (/^\d{1,4}$/.test(s)) { h = Number(s.length <= 2 ? s : s.slice(0, -2)); m = s.length <= 2 ? 0 : Number(s.slice(-2)); }
  else return null;
  if (m > 59 || h > 23 && !(allow24 && h === 24 && m === 0)) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
export const HALF_HOUR_TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
