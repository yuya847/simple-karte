import type { PanelKind } from "../../components/ToolRail";
import type { AdmitEval } from "../admit-eval";
import type { DocRecord } from "../documents";
import type { GuidanceRecord } from "../guidance";
import type { Letter } from "../letters";
import type { NursingProblem } from "../nursing-plan";
import type { RehabPlan } from "../rehab";
import type { Restraint } from "../restraint";
import type { TdmReport } from "../tdm";
import type { HistoryEntry } from "../types";
import { addDays, isoDate } from "../dates";
import type { ClaimResult } from "./model";
import type { KisaiBasis } from "./kisai-sources";

/** WardAppの既存stateを渡す。省略は未取得、[]は取得済みで記録なし。 */
export interface KisaiChart {
  patientId: string;
  today: string;
  admittedOn: number;
  evaluation?: AdmitEval;
  documents?: DocRecord[];
  guidance?: GuidanceRecord[];
  letters?: Letter[];
  nursingPlans?: NursingProblem[];
  rehabPlans?: RehabPlan[];
  tdmReports?: TdmReport[];
  restraints?: Restraint[];
  /** 当該患者の記事。記事検索だけでは記載内容の充足を認定しない。 */
  entries?: HistoryEntry[];
}
export interface KisaiEvidence {
  key: string;
  panel: PanelKind;
  date?: string;
  time?: string;
  by?: string;
  /** 判定に実際に用いた原記録。画面側で照合できる。 */
  data: unknown;
}
export interface KisaiCheck {
  id: string;
  codes: string[];
  requirement: string;
  status: "ある" | "ない" | "人が確かめる";
  reason: string;
  basis: KisaiBasis;
  evidence: KisaiEvidence[];
  /** 「ない」の判定も検証できるよう、調べた範囲と取得状況を残す。 */
  examined: { patientId: string; admittedOn: number; month: string; loaded: boolean; keys: string[]; data: unknown };
  open: { panel: PanelKind; key?: string };
}
export const chartDate = (today: string, day: number) => isoDate(addDays((() => { const [y, m, d] = today.split("-").map(Number); return { y, m, d }; })(), day));

/** 「ある」は記録の存在だけ。適応・説明の実態・算定の可否を認定しない。 */
export function checkKisai(claim: ClaimResult, chart: KisaiChart): KisaiCheck[] {
  const lines = claim.acts.flatMap(a => a.parts.flatMap(p => p.lines));
  const billed = (codes: string[]) => lines.filter(l => codes.includes(l.code)).map(l => l.code);
  const out: KisaiCheck[] = [];
  const end = `${claim.month}-31`;
  const inStay = (day: number) => day >= chart.admittedOn && chartDate(chart.today, day) <= end;
  const ev = chart.evaluation?.patientId === chart.patientId ? chart.evaluation : undefined;
  function add(id: string, codes: string[], requirement: string, panel: PanelKind, basis: KisaiBasis, evidence: KisaiEvidence[], loaded: boolean, complete = true) {
    const found = [...new Set(billed(codes))];
    if (!found.length) return;
    const patientRows = <T extends { patientId: string }>(rows?: T[]) => rows?.filter(r => r.patientId === chart.patientId);
    const snapshots: Record<string, unknown> = {
      "admission-plan": { plan: ev?.plan, documents: patientRows(chart.documents)?.filter(d => d.kind === "入院診療計画書") },
      "nutrition-plan": { plan: ev?.plan, nutrition: ev?.nutrition, documents: patientRows(chart.documents)?.filter(d => d.kind === "栄養管理計画書") },
      delirium: ev?.delirium,
      "discharge-plan": patientRows(chart.documents)?.filter(d => d.kind === "退院支援計画書"),
      "dementia-plan": patientRows(chart.nursingPlans),
      pharmacy: patientRows(chart.guidance)?.filter(g => g.kind === "服薬指導"),
      "nutrition-guidance": patientRows(chart.guidance)?.filter(g => g.kind === "栄養食事指導"),
      "letter-copy": patientRows(chart.letters),
      "emergency-state": chart.entries,
      restraint: patientRows(chart.restraints),
      tdm: patientRows(chart.tdmReports),
    };
    const status = evidence.length ? complete ? "ある" : "人が確かめる" : loaded ? "ない" : "人が確かめる";
    out.push({ id, codes: found, requirement, status, basis, evidence, examined: { patientId: chart.patientId, admittedOn: chart.admittedOn, month: claim.month, loaded, keys: evidence.map(e => e.key), data: snapshots[id] }, open: { panel, key: evidence[0]?.key }, reason: status === "ある" ? "対象入院の記録あり。内容・説明の実態は人が確認" : status === "ない" ? "入力された対象入院の記録にはない（紙・他システムは未確認）" : "未取得、記録の不足、または内容の判断が必要" });
  }
  const evidence = (key: string, panel: PanelKind, data: unknown, at?: { day: number; time: string }, by?: string): KisaiEvidence => ({ key, panel, data, date: at && chartDate(chart.today, at.day), time: at?.time, by });
  const docs = (kind: DocRecord["kind"]) => chart.documents?.filter(d => d.patientId === chart.patientId && d.kind === kind && inStay(d.at.day)).map(d => evidence(d.id, "docs", d, d.at, d.by)) ?? [];
  const base = lines.filter(l => /急性期一般入院料/.test(l.name)).map(l => l.code);
  const plan = ev?.plan;
  add("admission-plan", base, "入院診療計画・文書による説明の記録", "docs", { source: "facility", section: "別添2 第1の1(1)〜(3)", text: "入院後7日以内に文書で説明し、説明日と説明者を記録" }, plan && inStay(plan.explainedAt.day) ? [evidence("evaluation.plan", "docs", plan, plan.explainedAt, plan.explainedBy)] : docs("入院診療計画書"), !!chart.documents || !!ev, !!plan?.explainedBy && !!plan?.explainedTo && !!plan?.treatment);
  if (!plan || plan.nutritionNeeded === "有") {
    const n = ev?.nutrition;
    add("nutrition-plan", base, "特別な栄養管理が必要な患者の栄養管理計画書", "nutrition", { source: "facility", section: "別添2 第1の5(3)〜(6)", text: "特別な栄養管理が必要な患者ごとの計画を作成し、計画書又は写しを診療録等に添付" }, n && inStay(n.at.day) ? [evidence("evaluation.nutrition", "nutrition", n, n.at, n.by)] : docs("栄養管理計画書"), (!!chart.documents || !!ev) && !!plan, !!plan && !!n?.goal && n.energyKcal > 0 && n.proteinG > 0);
  }
  const d = ev?.delirium;
  add("delirium", ["190218510"], "せん妄リスクのチェックリスト・ハイリスク患者への対策", "bedside", { source: "notice", section: "A247-2(3)(4)・別紙様式7の3", text: "入院前又は入院後3日以内にリスク因子を確認し、チェックリストに基づき対策を実施" }, d && chartDate(chart.today, d.at.day) <= end ? [evidence("evaluation.delirium", "bedside", d, d.at, d.by)] : [], !!ev, !!d?.by && d.at.day <= chart.admittedOn + 3 && (!d.checked.length || !!d.measures.length));
  add("discharge-plan", ["190192310"], "退院支援計画", "msw-support", { source: "notice", section: "A246(3)〜(5)", text: "退院困難な要因等を含む退院支援計画を作成" }, docs("退院支援計画書"), !!chart.documents);
  const np = chart.nursingPlans?.filter(n => n.patientId === chart.patientId && inStay(n.plannedOn)) ?? [];
  add("dementia-plan", ["190193310", "190193410"], "認知症の症状を踏まえた看護計画・ケアと評価（対象となる場合）", "nursing-plan", { source: "notice", section: "A247(7)イ・エ、(8)", text: "症状の治療への影響が見込まれる場合に看護計画を作成し、ケアと評価を行う。拘束解除を毎日検討" }, np.map(n => evidence(n.id, "nursing-plan", n, { day: n.plannedOn, time: n.plannedAt }, n.by)), !!chart.nursingPlans, false);
  for (const [id, codes, kind, requirement, section, text] of [
    ["pharmacy", ["113010810", "120001610", "113004270"], "服薬指導", "薬剤管理指導記録（麻薬加算時は麻薬に係る内容も）", "B008(1)(5)(8)", "患者ごとに指導内容・実施日・作成日等を記録し最低3年保存"],
    ["nutrition-guidance", ["113017610", "113017710"], "栄養食事指導", "栄養指導記録・内容の要点と指導時間", "B001 10(3)・9(16)", "患者ごとに栄養指導記録を作成し、指導内容の要点・指導時間を記載"],
  ] as const) {
    const gs = chart.guidance?.filter(g => g.patientId === chart.patientId && g.kind === kind && inStay(g.at.day) && chartDate(chart.today, g.at.day).startsWith(claim.month)) ?? [];
    const neededDays = new Set(claim.acts.filter(a => a.parts.some(p => p.lines.some(l => (codes as readonly string[]).includes(l.code)))).flatMap(a => Object.keys(a.days).map(Number)));
    add(id, [...codes], requirement, "guide-record", { source: "notice", section, text }, gs.map(g => evidence(g.id, "guide-record", g, g.at, g.by)), !!chart.guidance, [...neededDays].every(day => gs.some(g => Number(chartDate(chart.today, g.at.day).slice(-2)) === day && g.text.trim() && (kind !== "栄養食事指導" || g.minutes !== null))));
  }
  const tdm = chart.tdmReports?.filter(t => t.patientId === chart.patientId && t.reportedDate?.startsWith(claim.month)) ?? [];
  const undatedTdm = chart.tdmReports?.filter(t => t.patientId === chart.patientId && !t.reportedDate) ?? [];
  add("tdm", ["113000410", "113000510", "113029170", "113000770"], "薬剤の血中濃度・治療計画の要点", "pharmacy-tdm", { source: "notice", section: "B001 2(1)キ", text: "薬剤の血中濃度、治療計画の要点を診療録に添付又は記載" }, [...tdm, ...undatedTdm].map(t => ({ ...evidence(t.id, "pharmacy-tdm", t, undefined, t.by), date: t.reportedDate, time: t.at })), !!chart.tdmReports, !!tdm.length && !undatedTdm.length && tdm.every(t => t.proposal.trim() && t.status === "確認済"));
  const ls = chart.letters?.filter(l => l.patientId === chart.patientId && l.status === "確定" && l.confirmedAt && inStay(l.confirmedAt.day) && chartDate(chart.today, l.confirmedAt.day).startsWith(claim.month)) ?? [];
  const letterCodes = lines.filter(l => /診療情報提供料（?[Ⅰ１1]/.test(l.name)).map(l => l.code);
  add("letter-copy", letterCodes, "交付した診療情報提供書の写し", "letter", { source: "notice", section: "B009(2)(3)", text: "診療状況を示す文書を添えて紹介し、その文書の写しを診療録に添付" }, ls.map(l => evidence(l.id, "letter", l, l.confirmedAt, l.confirmedBy)), !!chart.letters);
  add("emergency-state", ["190171910", "190172010"], "入院時の重症な状態・指標・主要な診療行為", "billing", { source: "table", section: "項番18・19 A205", text: "該当する状態、入院時の指標及び入院後3日以内の主要な診療行為等を記載" }, (chart.entries ?? []).filter(e => e.day === chart.admittedOn).map(e => evidence(e.id ?? `entry:${e.day}:${e.time}`, "billing", e, e, e.author)), false, false);
  const rs = chart.restraints?.filter(r => r.patientId === chart.patientId && chartDate(chart.today, r.start.day) <= end && (!r.end || chartDate(chart.today, r.end.at.day) >= `${claim.month}-01`)) ?? [];
  if (rs.length || chart.restraints === undefined) add("restraint", base, "身体的拘束を行った場合の態様・開始終了時間・心身の状況・理由", "restraint", { source: "facility", section: "別添2 第1の7(4)", text: "身体的拘束の態様・実施時間・患者の心身の状況・緊急やむを得ない理由を記録" }, rs.map(r => evidence(r.id, "restraint", r, r.start, r.confirmedBy)), !!chart.restraints, rs.every(r => r.devices.length && r.why.trim() && r.state.trim() && r.end));
  return out;
}
