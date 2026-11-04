// 連携サマリ・看護サマリ: what the next carer needs to know, gathered from the record by code — the
// items listed for 介護・地域連携 (既往歴・感染症・病名・生活上の注意・検査データ・バイタル・処置/処方・
// 制限事項・ADL). The writer adds their own words; nothing here is written by AI.

import type { AdmitEval } from "./admit-eval";
import { scheduleLabel, type CareOrder } from "./care-orders";
import { addDays, formatShort } from "./dates";
import { summaryLines, type NursingProblem } from "./nursing-plan";
import { diagnosisLabel, type Diagnosis } from "./diagnoses";
import { orderLines } from "./format";
import type { CalendarDate } from "./dates";
import { ANALYTES } from "./master";
import { callText, prnText, type StandingOrders } from "./standing";
import type { OrderEntry, Patient } from "./types";

export const DESTINATIONS = ["介護施設・ケアマネジャー", "訪問看護（在宅）", "転院先の病院", "院内（転棟）"] as const;
export type Destination = (typeof DESTINATIONS)[number];

export interface SummarySection {
  heading: string;
  lines: string[];
}

const KEY_LABS = ["WBC", "Hb", "Plt", "Alb", "Cre", "Na", "K", "CRP"];

export function summaryFacts(p: Patient, entries: OrderEntry[], today: CalendarDate, extra: { diagnoses: Diagnosis[]; standing?: StandingOrders; dietNow?: string; evals?: AdmitEval; nursing?: { problems: NursingProblem[]; care: CareOrder[] } }): SummarySection[] {
  const active = entries.filter((e) => e.status === "有効");
  const lines = (type: OrderEntry["order"]["type"]) =>
    active.filter((e) => e.order.type === type).map((e) => {
      const l = orderLines(e.order, today);
      return `${l.main}　${l.detail}`;
    });
  const dx = extra.diagnoses.filter((d) => d.outcome === "継続");
  const labs = KEY_LABS.flatMap((code) => {
    const r = [...p.labs].sort((a, b) => b.day - a.day || b.time.localeCompare(a.time)).find((x) => code in x.values);
    if (!r) return [];
    const a = ANALYTES.find((x) => x.code === code);
    return [`${a?.name ?? code} ${r.values[code]}${a?.unit ?? ""}（${r.day === 0 ? "今日" : `${-r.day}日前`}）`];
  });
  const v = p.vitals.at(-1);
  const s = extra.standing;
  const ev = extra.evals;
  const out: SummarySection[] = [
    { heading: "病名", lines: dx.length ? dx.map((d) => `${diagnosisLabel(d)}${d.main ? "（主病名）" : ""}`) : [p.admissionDiagnosis] },
    { heading: "感染症・アレルギー", lines: [`感染症：${p.infections.join("、") || "なし"}`, `アレルギー：${p.allergies.join("、") || "なし"}`] },
    { heading: "生活上の注意", lines: [...p.cautions, ...(p.codeStatus ? [`事前指示：${p.codeStatus}`] : [])] },
    { heading: "制限事項（安静・入浴・食事）", lines: [s?.rest && `安静度：${s.rest}`, s?.bath && `清潔：${s.bath}`, extra.dietNow && `食事：${extra.dietNow}`].filter((x): x is string => !!x) },
    {
      heading: "ADL・リスク",
      lines: [
        ev?.pressure && `日常生活自立度：${ev.pressure.adl}${ev.pressure.ulcerNow ? "（褥瘡あり）" : ""}`,
        ev?.fall?.checked.length ? `転倒転落の危険因子：${ev.fall.checked.join("、")}` : null,
        ev?.delirium?.checked.length ? `せん妄の危険因子：${ev.delirium.checked.join("、")}` : null,
      ].filter((x): x is string => !!x),
    },
    // 看護サマリ: the open nursing problems and the care orders in force (the caller passes those in force).
    ...(extra.nursing
      ? [
          { heading: "看護問題（看護計画）", lines: summaryLines(extra.nursing.problems, p.id, (d) => formatShort(addDays(today, d))) },
          { heading: "看護ケア（看護師の指示）", lines: extra.nursing.care.filter((o) => o.patientId === p.id).map((o) => `${o.item}　${scheduleLabel(o)}${o.note ? `（${o.note}）` : ""}`) },
        ]
      : []),
    { heading: "処方（内服）", lines: lines("prescription") },
    { heading: "注射", lines: lines("injection") },
    { heading: "処置", lines: lines("procedure") },
    { heading: "検査データ（最新）", lines: labs },
    { heading: "バイタル（最新）", lines: v ? [`${v.day === 0 ? "今日" : `${-v.day}日前`} ${v.time}　BT ${v.bt ?? "—"}　HR ${v.hr ?? "—"}　BP ${v.sbp ?? "—"}/${v.dbp ?? "—"}　RR ${v.rr ?? "—"}　SpO2 ${v.spo2 ?? "—"}%（${v.o2 ?? "室内気"}）`] : [] },
    { heading: "医師への連絡の基準・頓用（指示簿）", lines: s ? [...s.calls.map(callText), ...s.prn.map(prnText)] : [] },
    { heading: "退院支援", lines: ev?.discharge ? [`退院困難な要因：${ev.discharge.factors.join("、") || "なし"}`, ev.discharge.note].filter(Boolean) : [] },
  ];
  return out.map((x) => ({ ...x, lines: x.lines.length ? x.lines : ["記録なし"] }));
}
