// 退院時サマリーと診療情報提供書. Facts (diagnoses, allergies, tests, drugs, procedures) are gathered
// from the chart by code — AI never writes them. The doctor's own account of the stay (主訴・現病歴・
// 経過・退院時の状態・今後の方針) is dictated; Claude only puts the doctor's sentences into those
// sections. The doctor checks and signs.

import { addDays, formatShort, type CalendarDate } from "./dates";
import { diagnosisLabel, type Diagnosis } from "./diagnoses";
import { orderLines } from "./format";
import { ANALYTES, anyDrugName } from "./master";
import type { InjectionOrder, OrderEntry, Patient } from "./types";
import { verbalUnsigned } from "./verbal";

export const SECTIONS = [
  { key: "complaint", label: "主訴" },
  { key: "reason", label: "入院理由" },
  { key: "present", label: "現病歴" },
  { key: "course", label: "入院後の経過" },
  { key: "status", label: "退院時の状態" },
  { key: "plan", label: "今後の方針・退院後の注意" },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];

export interface DischargeDraft {
  patientId: string;
  /** Planned or actual discharge day (offset from today). */
  dischargeDay: number;
  destination: string;
  /** 退院時転帰・入院経路（JP-CLINS のコード）. */
  outcome: string;
  route: string;
  sections: Record<SectionKey, string>;
  status: "作成中" | "確定";
  confirmedAt?: { day: number; time: string };
  confirmedBy?: string;
  /** 承認 by the team's 指導医 (or 上級医 for a 研修医's), summary-approval.ts. */
  approval?: { by: string; at: { day: number; time: string }; comment?: string };
  /** 差し戻し: sent back to the writer with a comment (status goes back to 作成中). */
  returned?: { by: string; at: { day: number; time: string }; comment: string };
  /** 診療情報提供書. */
  letter: { to: string; dept: string; doctor: string; purpose: string; issuedAt?: { day: number; time: string }; /** 退院後の治療計画・検査結果・画像を添付（B009 注8）. */ attach?: boolean };
}

export const emptySections = (): Record<SectionKey, string> => ({ complaint: "", reason: "", present: "", course: "", status: "", plan: "" });

/** 退院時転帰 and 入院経路 — codes of JP-CLINS v1.13.0 (HS039 退院時サマリー HL7 FHIR 記述仕様で必須). */
export const OUTCOMES = [
  { code: "1", label: "治癒・軽快" },
  { code: "3", label: "寛解" },
  { code: "4", label: "不変" },
  { code: "5", label: "増悪" },
  { code: "6", label: "傷病による死亡" },
  { code: "7", label: "傷病以外による死亡" },
  { code: "9", label: "その他" },
];
export const ROUTES = [
  { code: "1", label: "家庭から" },
  { code: "0", label: "転棟" },
  { code: "4", label: "転院" },
  { code: "5", label: "介護・福祉施設から" },
  { code: "8", label: "院内出生" },
  { code: "9", label: "その他" },
];
export const labelOf = (list: { code: string; label: string }[], code?: string) => list.find((x) => x.code === code)?.label ?? "—";

/** Key tests: first and latest value of each analyte the patient has, in the master's order. */
export function labTrend(p: Patient, codes = ["WBC", "Hb", "Plt", "CRP", "PCT", "Alb", "AST", "ALT", "BUN", "Cre", "Na", "K", "BNP", "NT-proBNP", "Glu", "HbA1c"]) {
  const sorted = [...p.labs].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  return codes
    .map((code) => {
      const vals = sorted.filter((l) => l.values[code] !== undefined);
      if (!vals.length) return null;
      const a = ANALYTES.find((x) => x.code === code);
      const first = vals[0];
      const last = vals.at(-1)!;
      return { code, name: a?.name ?? code, unit: a?.unit ?? "", first: { day: first.day, value: first.values[code] }, last: { day: last.day, value: last.values[code] } };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
}

export interface Facts {
  admitted: string;
  discharge: string;
  days: number;
  admissionDiagnosis: string;
  diagnoses: string[];
  allergies: string[];
  infections: string[];
  injections: string[];
  procedures: string[];
  prescriptions: string[];
  cultures: string[];
  imaging: string[];
  labs: ReturnType<typeof labTrend>;
}

export function collectFacts(p: Patient, entries: OrderEntry[], diagnoses: Diagnosis[], today: CalendarDate, dischargeDay: number): Facts {
  const orders = entries.filter((e) => e.kind === "order");
  const span = (e: OrderEntry) => `${formatShort(addDays(today, e.day))}〜${e.status === "中止" && e.stoppedOn !== undefined ? formatShort(addDays(today, e.stoppedOn)) : "継続中"}`;
  return {
    admitted: formatShort(addDays(today, p.admittedOn)),
    discharge: formatShort(addDays(today, dischargeDay)),
    days: dischargeDay - p.admittedOn + 1,
    admissionDiagnosis: p.admissionDiagnosis,
    diagnoses: diagnoses.map((d) => `${diagnosisLabel(d)}${d.main ? "（主）" : ""}${d.outcome !== "継続" ? `：${d.outcome}` : ""}`),
    allergies: p.allergies,
    infections: p.infections,
    injections: orders.filter((e) => e.order.type === "injection").map((e) => `${orderLines(e.order, today).main}（${span(e)}）`),
    procedures: orders.filter((e) => e.order.type === "procedure").map((e) => `${orderLines(e.order, today).main}（${span(e)}）`),
    prescriptions: orders.filter((e) => e.order.type === "prescription" && e.status === "有効").map((e) => orderLines(e.order, today).main),
    cultures: p.cultures.map((c) => `${formatShort(addDays(today, c.collectedOn))} ${c.specimen}${c.sets ? ` ${c.sets}` : ""}：${c.organism ?? c.gram ?? c.status}${c.susceptibility?.length ? `（${c.susceptibility.map((s) => `${s.drug} ${s.result}`).join("、")}）` : ""}${c.status !== "最終報告" ? `［${c.status}］` : ""}`),
    imaging: p.imaging.filter((s) => !s.pending).map((s) => `${formatShort(addDays(today, s.day))} ${s.modality} ${s.region}：${s.report.split(/。/)[0]}。`),
    labs: labTrend(p),
  };
}

/** Things to settle before discharge (code). */
export function dischargeChecks(p: Patient, entries: OrderEntry[], consentsPending: string[]): string[] {
  const out: string[] = [];
  const orders = entries.filter((e) => e.kind === "order");
  const iv = orders.filter((e) => e.status === "有効" && e.order.type === "injection");
  if (iv.length) out.push(`注射が ${iv.length}件 有効のまま：${iv.map((e) => (e.order as InjectionOrder).items.map((i) => anyDrugName(i.drugCode)).join("＋")).join("、")}（退院までに中止するか、内服に変えるか）`);
  const pending = p.cultures.filter((c) => c.status !== "最終報告");
  if (pending.length) out.push(`結果が出ていない培養：${pending.map((c) => c.specimen).join("、")}（退院後に誰が結果を見るか決める）`);
  const verbal = verbalUnsigned(orders);
  if (verbal.length) out.push(`口頭指示の承認待ち ${verbal.length}件`);
  if (consentsPending.length) out.push(`説明前の同意書：${consentsPending.join("、")}`);
  return out;
}

/** Deadline for the summary: 診療録管理体制加算１ asks that 9 in 10 of last month's discharges have one made within
 * 14 days counted from the day after discharge (保医発0305第7号 別添3 第4の1(8), p.95〜96; checked 2026-11-04). */
export const SUMMARY_DEADLINE_DAYS = 14;
export const SUMMARY_DEADLINE_SOURCE = "診療録管理体制加算１の要件（保医発0305第7号 別添3 第4の1(8)：前月に退院した患者のうち、退院日の翌日から起算して14日以内に退院時要約が作成されて中央病歴管理室に提出された者が毎月9割以上。令和8年度）";
export const SUMMARY_DEADLINE_URL = "https://www.mhlw.go.jp/content/12400000/001757361.pdf";
