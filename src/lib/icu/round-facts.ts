// ICU 回診のテンプレート（記事のテンプレート rec-icu-round）に貼るカルテの値。値の取り出しと文の形だけで、
// 判定・勧めは書かない。値がない欄は空のまま。
import { abs } from "../flowsheet";
import type { Patient } from "../types";
import { abgRows, ventAt } from "./abg";
import { hourlyBalance } from "./balance";
import { doseText, rateAt } from "./gamma";
import { lineDays } from "./lines";
import { sofaFacts, sofaScore } from "./sofa";
import type { IcuRecords } from "./types";
import { ventSettingText } from "./vent-text";
export { ventSettingText };

const hhmm = (t: number) => `${String(Math.floor((((t % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String(((t % 60) + 60) % 60).padStart(2, "0")}`;
const when = (t: number, day: number) => `${Math.floor(t / 1440) === day ? "今日" : Math.floor(t / 1440) === day - 1 ? "昨日" : `${Math.floor(t / 1440) - day}日`} ${hhmm(t)}`;

/** The 文 fields of the template and what the chart has for each (now = minutes from today 0:00). */
export function icuRoundValues(p: Patient, records: IcuRecords, nowAbs: number): Record<string, string> {
  const day = Math.floor(nowAbs / 1440);
  const today = sofaScore(sofaFacts(p, records, day, nowAbs));
  const yesterday = sofaScore(sofaFacts(p, records, day - 1, nowAbs));
  const total = (s: ReturnType<typeof sofaScore>) => (s.total === null ? "" : `${s.total}点${s.assumed.length ? `（推定を含む：${s.assumed.join("・")}）` : ""}`);
  const items = today.items.some((i) => i.score !== null) ? today.items.map((i) => `${i.label} ${i.score ?? "—"}`).join("・") : "";
  const abg = abgRows(p, records.vents).filter((r) => abs(r.day, r.time) <= nowAbs && r.pf !== null).at(-1);
  const vent = ventAt(records.vents, p.id, nowAbs);
  const drips = records.infusions.filter((i) => i.patientId === p.id && rateAt(i, nowAbs) !== null);
  const balance = hourlyBalance(p, records, day, nowAbs).filter((h) => h.recorded);
  const sum = (k: "inMl" | "outMl" | "netMl") => Math.round(balance.reduce((n, h) => n + h[k], 0));
  const lines = records.lines.filter((l) => l.patientId === p.id && abs(l.insertedAt.day, l.insertedAt.time) <= nowAbs && (!l.removedAt || abs(l.removedAt.day, l.removedAt.time) > nowAbs));
  const rass = records.hourly.filter((h) => h.patientId === p.id && h.rass !== undefined && abs(h.at.day, h.at.time) <= nowAbs).sort((a, b) => abs(a.at.day, a.at.time) - abs(b.at.day, b.at.time)).at(-1);
  return {
    "文:SOFA 今日": total(today),
    "文:SOFA 昨日": total(yesterday),
    "文:SOFA の内訳": items,
    "文:P/F": abg ? `${abg.pf}（PaO2 ${abg.values.PaO2} ÷ FiO2 ${abg.fio2}、${when(abs(abg.day, abg.time), day)}）` : "",
    "文:呼吸器": vent ? ventSettingText(vent) : "",
    "文:持続投与": drips.map((i) => `${i.name} ${doseText(i, nowAbs).split("（")[0]}・${rateAt(i, nowAbs)!.toFixed(1)}mL/時`).join("、"),
    "文:出納": balance.length ? `IN ${sum("inMl")}mL／OUT ${sum("outMl")}mL／差 ${sum("netMl")}mL（今日 0〜${Math.floor((((nowAbs % 1440) + 1440) % 1440) / 60)}時の記録分）` : "",
    "文:ライン": lines.map((l) => `${l.kind} ${l.site}（${lineDays(l, day)}）`).join("、"),
    "文:RASS": rass ? `${rass.rass}（${when(abs(rass.at.day, rass.at.time), day)}）` : "",
  };
}
