import { currentInfusion } from "./icu/current-infusion";
import { lineDays } from "./icu/lines";
import type { IcuRecords } from "./icu/types";
import type { StandingLine } from "./standing-lines";
import { abs } from "./flowsheet";
import { currentScreening, lifeLines, lifeWithIntake } from "./life-support";
// 連携サマリ・看護サマリ: what the next carer needs to know, gathered from the record by code — the
// items listed for 介護・地域連携 (既往歴・感染症・病名・生活上の注意・検査データ・バイタル・処置/処方・
// 制限事項・ADL). The writer adds their own words; nothing here is written by AI.

import { biTotal } from "./barthel";
import type { RehabDesk } from "./rehab";
import type { AdmitEval } from "./admit-eval";
import { anamnesisSummary, type AnamnesisFields } from "./anamnesis";
import { scheduleLabel, type CareOrder } from "./care-orders";
import { addDays, formatShort } from "./dates";
import { summaryLines, type NursingProblem } from "./nursing-plan";
import { diagnosisLabel, type Diagnosis } from "./diagnoses";
import { orderLines } from "./format";
import type { CalendarDate } from "./dates";
import { ANALYTES } from "./master";
import { callText, prnText, type StandingOrders } from "./standing";
import type { OrderEntry, Patient } from "./types";

export const DESTINATIONS = ["介護施設・ケアマネジャー", "訪問看護（在宅）", "転院先の病院", "院内（転棟）", "地域連携室（院内）"] as const;
export type Destination = (typeof DESTINATIONS)[number];

export interface SummarySection {
  heading: string;
  lines: string[];
}

const KEY_LABS = ["WBC", "Hb", "Plt", "Alb", "Cre", "Na", "K", "CRP"];

export function summaryFacts(p: Patient, entries: OrderEntry[], today: CalendarDate, extra: { icu?: IcuRecords; now?: number; standingLines?: StandingLine[]; rehab?: RehabDesk; diagnoses: Diagnosis[]; standing?: StandingOrders; dietNow?: string; evals?: AdmitEval; nursing?: { problems: NursingProblem[]; care: CareOrder[] }; anamnesis?: AnamnesisFields }): SummarySection[] {
  const active = entries.filter((e) => e.status === "有効");
  const lines = (type: OrderEntry["order"]["type"]) =>
    entries.filter((e) => (e.status === "有効" || e.status === "実施済") && e.order.type === type && !(type === "procedure" && e.order.type === "procedure" && (e.order.rehab || e.order.leave))).map((e) => {
      const l = orderLines(e.order, today);
      const current = e.order.type === "injection" ? currentInfusion(e.order,extra.icu,p.id,extra.now ?? 1439) : undefined;
      return `${l.main}　${e.status === "実施済" ? `実施（${formatShort(addDays(today, e.order.type === "procedure" ? e.order.start.day : e.day))}）` : current?.text ?? l.detail}`;
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
  const screening = currentScreening(ev?.discharge);
  const bi = extra.rehab?.bi.filter(e => e.patientId === p.id).sort((a,b) => a.day - b.day || a.time.localeCompare(b.time)).at(-1);
  const fim = extra.rehab?.fim?.filter(e => e.patientId === p.id).sort((a,b) => a.day - b.day || a.time.localeCompare(b.time)).at(-1);
  const out: SummarySection[] = [
    { heading: "生活・制度", lines: lifeLines(lifeWithIntake(ev?.lifeSupport, extra.anamnesis)) },
    { heading: "病名", lines: dx.length ? dx.map((d) => `${diagnosisLabel(d)}${d.main ? "（主病名）" : ""}`) : [p.admissionDiagnosis] },
    { heading: "感染症・アレルギー", lines: [`感染症：${p.infections.join("、") || "なし"}`, `アレルギー：${p.allergies.join("、") || "なし"}`] },
    ...(p.contraindications?.length ? [{ heading: "禁忌", lines: p.contraindications }] : []),
    { heading: "生活上の注意", lines: [...p.cautions, ...(p.codeStatus ? [`事前指示：${p.codeStatus}`] : [])] },
    // 入院時の情報収集 (anamnesis.ts): the life before admission, without asking again.
    ...(extra.anamnesis ? [{ heading: "入院前の生活（入院時の情報収集）", lines: anamnesisSummary(extra.anamnesis) }] : []),
    { heading: "制限事項（安静・入浴・食事）", lines: [s?.rest && `安静度：${s.rest}`, s?.bath && `清潔：${s.bath}`, extra.dietNow && `食事：${extra.dietNow}`].filter((x): x is string => !!x) },
    {
      heading: "ADL・リスク",
      lines: [
        `BI：${bi ? biTotal(bi.scores) : "記録なし"}`,
        `FIM：${fim ? fim.scores.reduce((a,b) => a+b,0) : "記録なし"}`,
        `歩行：${fim?.walk || "記録なし"}`,
        `移乗：${fim?.transfer || "記録なし"}`,
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
    { heading: "処置", lines: [...lines("procedure"), ...(extra.icu?.lines ?? []).filter(l=>l.patientId===p.id&&abs(l.insertedAt.day,l.insertedAt.time)<=(extra.now??1439)&&(!l.removedAt||abs(l.removedAt.day,l.removedAt.time)>(extra.now??1439))).map(l=>`${l.kind} ${l.site} ${lineDays(l, Math.floor((extra.now??1439)/1440))}`)] },
    ...["リハビリ処方", "退院・外泊"].map((heading, i) => ({ heading, lines: active.filter(e => e.order.type === "procedure" && (i === 0 ? e.order.rehab : e.order.leave)).map(e => { const l = orderLines(e.order, today); return `${l.main} ${l.detail}`; }) })),
    { heading: "検査データ（最新）", lines: labs },
    { heading: "バイタル（最新）", lines: v ? [`${v.day === 0 ? "今日" : `${-v.day}日前`} ${v.time}　BT ${v.bt ?? "—"}　HR ${v.hr ?? "—"}　BP ${v.sbp ?? "—"}/${v.dbp ?? "—"}　RR ${v.rr ?? "—"}　SpO2 ${v.spo2 ?? "—"}%（${v.o2 ?? "室内気"}）`] : [] },
    { heading: "医師への連絡の基準・頓用（指示簿）", lines: s ? [...new Set([...(extra.standingLines ?? []).filter(l=>abs(l.start.day,l.start.time??"00:00")<=(extra.now??1439)&&(!l.stop||abs(l.stop.day,l.stop.time)>(extra.now??1439))&&(!l.changed||abs(l.changed.day,l.changed.time)>(extra.now??1439))&&(!l.end||abs(l.end.day,l.end.time??"23:59")>=(extra.now??1439))).map(l=>`${l.text}（${l.by}）`), ...(s.other ? [s.other] : []), ...s.calls.map(callText), ...(s.blockCallTexts ?? []), ...s.prn.map(prnText), ...(s.blockPrnTexts ?? [])])] : [] },
    { heading: "退院支援", lines: screening ? [`退院困難な要因：${screening.factors.join("、") || "なし"}`, screening.note].filter(Boolean) : [] },
  ];
  return out.map((x) => ({ ...x, lines: x.lines.length ? x.lines : ["記録なし"] }));
}
