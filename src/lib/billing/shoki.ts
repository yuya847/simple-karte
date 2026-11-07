// 出典・確認日: kisai-sources.ts。SJ: 記録条件仕様 第1章3(4)カ・別表23、手引き第15章。
import { anyDrugName } from "../master";
import type { Diagnosis } from "../diagnoses";
import { diagnosisClaimable, diagnosisLabel } from "../diagnoses";
import type { HistoryEntry, LabResult } from "../types";
import { chartDate } from "./kisai";
import type { ClaimResult, Shikibetsu } from "./model";
import type { KisaiBasis } from "./kisai-sources";
import { sjisLength, unencodable } from "./sjis";

export type ShokiCategory = "01" | "02" | "03" | "04" | "05" | "06" | "07" | "50" | "51" | "52" | "90";
export interface ShokiTarget { code: string; kubun: string; name: string; points: number; shikibetsu: Shikibetsu }
export interface Shoki {
  id: string;
  patientId: string;
  month: string;
  /** 任意の詳記は対象を空にしてよい。 */
  targets: ShokiTarget[];
  category: ShokiCategory;
  body: string;
  status: "下書き" | "確定";
  by: string;
  at: string;
  version: number;
}
export interface ShokiRequirement { target: ShokiTarget; basis: KisaiBasis; alternative: "摘要欄でも可" }
/** 明示的に症状詳記を求める項目だけ。通常の入院・A205等を一律に必須にしない。
 * 現engineは以下の検査・処置を生成しない。将来の算定行・手入力行でもコードで照合する。
 * 標準日数超リハ等の条件判断は未実装（engineも疾患別リハを生成しない）。
 */
const REQUIRED: Record<string, { kubun: string; section: string }> = {
  "160218710": { kubun: "D239 4", section: "別表Ⅰ 項番359" },
  "160183610": { kubun: "D310 3", section: "別表Ⅰ 項番366" },
  "160202750": { kubun: "D313 2", section: "別表Ⅰ 項番368" },
  "140055710": { kubun: "J007-2", section: "別表Ⅰ 項番476" },
};
export function requiredShoki(claim: ClaimResult): ShokiRequirement[] {
  const seen = new Set<string>();
  return claim.acts.flatMap(a => a.parts.flatMap(p => p.lines.flatMap(l => {
    const r = REQUIRED[l.code];
    if (!r || seen.has(l.code)) return [];
    seen.add(l.code);
    return [{ target: { code: l.code, kubun: r.kubun, name: l.name, points: p.points, shikibetsu: a.shikibetsu }, basis: { source: "table" as const, section: r.section, text: "患者の症状詳記を記載。記載可能であれば摘要欄への記載でも差し支えない" }, alternative: "摘要欄でも可" as const }];
  })));
}
export interface ShokiFactsInput {
  today: string;
  month: string;
  diagnoses: Diagnosis[];
  labs: LabResult[];
  entries: HistoryEntry[];
  /** 「主な」検査項目は医師・呼出元が選ぶ。省略時は実測値をすべて返す。 */
  labCodes?: string[];
}
/** 事実を日付順に並べる。文章の生成・診断・重要度の推定をしない。薬剤は指示として明示する。 */
export function collectShokiFacts(input: ShokiFactsInput) {
  const { today, month } = input;
  const inMonth = (day: number) => chartDate(today, day).startsWith(month);
  const end = `${month}-31`;
  return {
    diagnoses: input.diagnoses.filter(d => diagnosisClaimable(d, month) && chartDate(today, d.start) <= end && (d.outcomeDay === undefined || chartDate(today, d.outcomeDay) >= `${month}-01`)).map(d => ({ id: d.id, name: diagnosisLabel(d), startDate: chartDate(today, d.start), data: d })).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id)),
    labs: input.labs.filter(l => inMonth(l.day)).flatMap(l => Object.entries(l.values).filter(([code]) => !input.labCodes || input.labCodes.includes(code)).map(([code, value]) => ({ id: l.id, date: chartDate(today, l.day), time: l.time, code, value, data: l }))).sort((a, b) => `${a.date} ${a.time} ${a.code}`.localeCompare(`${b.date} ${b.time} ${b.code}`)),
    notes: input.entries.flatMap(e => e.kind === "note" && inMonth(e.day) ? [{ id: e.id, date: chartDate(today, e.day), time: e.time, by: e.author, heading: e.templateName || e.text?.split(/\r?\n/)[0] || e.soap?.a?.split(/\r?\n/)[0] || e.category || "記事", data: e }] : []).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    medications: input.entries.flatMap(e => e.kind === "order" && (e.order.type === "prescription" || e.order.type === "injection") && chartDate(today, e.order.start.day) <= end && (e.stoppedOn === undefined || chartDate(today, e.stoppedOn) >= `${month}-01`) && (e.order.days === undefined || chartDate(today, e.order.start.day + e.order.days - 1) >= `${month}-01`) ? [{ id: e.id, date: chartDate(today, e.order.start.day), by: e.author, kind: "指示（実投与は別途確認）" as const, items: (e.order.type === "prescription" ? [{ drugCode: e.order.drugCode, amount: e.order.amount, unit: e.order.unit }] : e.order.items).map(i => ({ ...i, name: anyDrugName(i.drugCode) })), order: e.order, data: e }] : []).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
  };
}
/** カンマはCSV区切りなので全角へ。仕様の使用不可文字である半角引用符は全角相当の引用符へ。改行は段落（レコード）として保持する。
 * Shift_JIS 2400バイト以内で文字境界を保って分割。後続区分を省略（手引き第15章2）。
 */
export function shokiRecords(items: Shoki[], patientId: string, month: string): string[] {
  const out: string[] = [];
  const categories: ShokiCategory[] = ["01", "02", "03", "04", "05", "06", "07", "50", "51", "52", "90"];
  const confirmed = items.filter(s => s.patientId === patientId && s.month === month && s.status === "確定");
  if (confirmed.some(s => !categories.includes(s.category))) throw new Error("記録条件仕様にない症状詳記区分です");
  for (const category of categories) {
    let first = true;
    for (const s of items.filter(s => s.patientId === patientId && s.month === month && s.status === "確定" && s.category === category)) {
      if (!s.body.trim() || !s.by.trim() || !s.at || !Number.isInteger(s.version) || s.version < 1) throw new Error("確定した症状詳記の本文・記録者・日時・版を確認してください");
      if (unencodable(s.body.replace(/\r?\n|\r/g, "")).length) throw new Error("症状詳記にシフトJISにない文字があります");
      for (const paragraph of s.body.replace(/,/g, "，").replace(/"/g, "”").split(/\r\n|\n|\r/)) {
        let chunk = "";
        let bytes = 0;
        const emit = () => { out.push(`SJ,${first ? category : ""},${chunk}`); first = false; chunk = ""; bytes = 0; };
        for (const ch of paragraph) {
          const n = sjisLength(ch);
          if (bytes + n > 2400) emit();
          chunk += ch; bytes += n;
        }
        emit();
      }
    }
  }
  return out;
}
