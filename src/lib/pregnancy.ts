import type { Patient } from "./types";

// 妊娠齢は満日数で数える（1週=7日）。基準日は登録した週数の日。
// 厚労省 https://www.bosei-navi.mhlw.go.jp/pregnancyweeks/
// 国立成育医療研究センター https://www.ncchd.go.jp/hospital/pregnancy/column/itsu.html
export function pregnancyLabel(p: Patient["pregnancy"], admittedOn: number, day = 0): string {
  if (p?.weeks == null) return "週数不明";
  const total = p.weeks * 7 + (p.days ?? 0) + day - (p.referenceDay ?? admittedOn);
  if (!Number.isInteger(total) || total < 0) return "週数不明";
  return `${Math.floor(total / 7)}週${total % 7}日`;
}
