// 内視鏡室 of the fictional hospital: the endoscopies doctors ordered (胃カメラ・大腸・気管支鏡, the orders of
// exams.ts), their 予約 and 受付, the 前処置 and 鎮静 (drugs, the watch of consciousness and vital signs, and
// the end of the watch), the 実施記録 with the scope used, the 洗浄・消毒 of each scope after each patient,
// biopsies sent to 病理, and the report the ordering doctor marks as read. What the code does: lists and
// orders the work, keeps a scope that has not been reprocessed (or failed its leak test) from being chosen,
// keeps the washer from being used before the day's check of the disinfectant, flags gaps in the watch
// during the exam, and makes the 病理 request from the biopsy. People observe, decide and write.

import { abs } from "./flowsheet";
import { examAt, findPhysio, type PhysioOrder } from "./exams";
import { ENDOSCOPY } from "./physio-desk";
import type { PathCase } from "./pathology";
import type { ResultItem } from "./results";
import type { DayOffset, OrderEntry, Patient } from "./types";

export const ENDO_SOURCES = {
  reprocess: {
    label: "日本消化器内視鏡学会「消化器内視鏡の洗浄・消毒標準化にむけたガイドライン」（日本消化器内視鏡学会雑誌 2018;60(7):1370-1396）ステートメント1-8・1-11・3-3",
    url: "https://www.jstage.jst.go.jp/article/gee/60/7/60_1370/_html/-char/ja",
  },
  multi: {
    label: "日本環境感染学会・日本消化器内視鏡学会・日本消化器内視鏡技師会「消化器内視鏡の感染制御に関するマルチソサエティ実践ガイド 改訂版」（2013年）第4章 Ⅰ〜Ⅶ、第5章",
    url: "https://jges.net/wp-content/uploads/2016/12/CD_MSguide20130710.pdf",
  },
  sedation: {
    label: "日本消化器内視鏡学会「内視鏡診療における鎮静に関するガイドライン（第2版）」（日本消化器内視鏡学会雑誌 2020;62(9):1635-1681）CQ3・CQ5・CQ7",
    url: "https://www.jstage.jst.go.jp/article/gee/62/9/62_1635/_html/-char/ja",
  },
} as const;

/** What the guidelines say, in short (shown with the records). */
export const ENDO_RULES = {
  history: "洗浄・消毒の履歴管理を行う。少なくとも ①年月日・時刻 ②患者氏名・ID ③内視鏡番号 ④洗浄担当者 ⑤洗浄消毒機番号 ⑥消毒薬濃度 を記録する（洗浄・消毒標準化ガイドライン ステートメント1-11）。",
  steps: "検査終了直後にベッドサイドで外表面の清拭と吸引・鉗子チャンネルの吸引洗浄（200mL以上）、ベッドサイド洗浄後に漏水テスト、用手でのブラッシングとすすぎのあとに自動洗浄・消毒装置にかける（マルチソサエティ実践ガイド 第4章、標準化ガイドライン ステートメント3-3）。",
  agents: "スコープの消毒には高水準消毒薬（過酢酸・グルタラール・フタラール）を用いる（実践ガイド 第5章）。",
  concentration: "使用前にテストストリップ等で消毒薬の濃度を確かめ、最低使用濃度を下回っていればすみやかに交換する（標準化ガイドライン 解説）。",
  storage: "消毒後はアルコールフラッシュで管路の乾燥を促し、ボタン類を外して清潔な乾燥した保管庫に保管する（標準化ガイドライン ステートメント1-8）。",
  watch: "鎮静中は意識レベル・呼吸・循環を継続して観察する（鎮静ガイドライン CQ3）。解説では意識レベル・脈拍・血圧・酸素飽和度を、検査中は少なくとも5分ごとに評価するとしている。",
  release: "監視解除（退室）の基準は確立されていないが、意識レベル・呼吸・循環を評価して判断し、判断した時点の評価を記録することが望ましい（鎮静ガイドライン CQ5）。",
  sedationRecord: "鎮静薬の名前・投与量・投与経路・酸素投与量、鎮静を担当した医師と看護師を記録する（鎮静ガイドライン CQ7 の解説）。",
} as const;

/** The fictional hospital's rules (shown as such). */
export const ENDO_HOUSE_RULES = {
  rooms: "内視鏡室は2部屋（内視鏡1・内視鏡2）、予約は30分ごと。",
  scopes: "",
  roles: "受付・前処置・鎮静中の観察・洗浄消毒は看護師（と医師）、実施記録・監視解除・レポート・病理への提出は医師が記録します。",
} as const;

export interface Moment {
  day: DayOffset;
  time: string;
}

export type ScopeKind = "上部" | "大腸" | "気管支";
export interface Scope {
  id: string;
  kind: ScopeKind;
  name: string;
}

/** The fictional hospital's scopes. */
export const SCOPES: Scope[] = [
  { id: "GIF-01", kind: "上部", name: "上部消化管用 1" },
  { id: "GIF-02", kind: "上部", name: "上部消化管用 2" },
  { id: "GIF-03", kind: "上部", name: "上部消化管用 3" },
  { id: "CF-01", kind: "大腸", name: "大腸用 1" },
  { id: "CF-02", kind: "大腸", name: "大腸用 2" },
  { id: "BF-01", kind: "気管支", name: "気管支鏡 1" },
];
export const WASHERS = ["洗浄消毒装置 1", "洗浄消毒装置 2"];
export type Agent = "過酢酸" | "グルタラール" | "フタラール";
/** Minutes of disinfection in the multi-society guide's table (過酢酸 5分・グルタラール 10分・フタラール 10分). */
export const AGENT_MINUTES: Record<Agent, number> = { 過酢酸: 5, グルタラール: 10, フタラール: 10 };
/** The disinfectant each washer of the fictional hospital uses. */
export const WASHER_AGENT: Record<string, Agent> = { "洗浄消毒装置 1": "過酢酸", "洗浄消毒装置 2": "過酢酸" };
export const ROOMS = ["内視鏡1", "内視鏡2"];

export const scopeKindOf = (test: string): ScopeKind => (test === "PHY-CF" ? "大腸" : test === "PHY-BF" ? "気管支" : "上部");

export type Consciousness = "清明" | "呼びかけで開眼" | "刺激で開眼" | "反応なし";
export const CONSCIOUSNESS: Consciousness[] = ["清明", "呼びかけで開眼", "刺激で開眼", "反応なし"];

export interface WatchRow {
  time: string;
  consciousness: Consciousness;
  hr?: number;
  sbp?: number;
  dbp?: number;
  spo2?: number;
  by: string;
}

export interface SedationDrug {
  name: string;
  dose: string;
  route: string;
  time: string;
}

export interface EndoReport extends Moment {
  findings: string;
  diagnosis: string;
  by: string;
  reason?: string;
}

export interface EndoWork {
  orderId: string;
  patientId: string;
  test: string;
  /** 予約の枠 set by the room (else the order's time). */
  slot?: { time: string; room: string; by: string };
  arrived?: Moment & { by: string };
  /** 前処置: what was given or done, at what time. */
  prep: { what: string; time: string; by: string }[];
  sedation?: { drugs: SedationDrug[]; o2: string; doctor: string; nurse: string };
  watch: WatchRow[];
  done?: { start: string; end: string; day: DayOffset; scope: string; doctor: string; assist: string; biopsy: number; procedures: string; complication: string };
  release?: Moment & { by: string; assessment: string };
  notDone?: Moment & { by: string; reason: string };
  report?: EndoReport;
  earlier?: EndoReport[];
  /** The 病理 case made from the biopsy. */
  pathCaseId?: string;
}

export interface Reprocess {
  id: string;
  scope: string;
  orderId: string;
  patientId: string;
  used: Moment;
  bedside?: Moment & { by: string };
  leak?: Moment & { by: string; ok: boolean };
  manual?: Moment & { by: string };
  machine?: { washer: string; agent: Agent; start: Moment; end?: Moment; by: string; ok?: boolean; note?: string };
  stored?: Moment & { by: string };
}

export interface ConcentrationCheck {
  washer: string;
  day: DayOffset;
  time: string;
  by: string;
  /** 最低使用濃度以上 / 下回った（交換した）. */
  ok: boolean;
  note?: string;
}

export interface EndoDesk {
  works: Record<string, EndoWork>;
  reprocess: Reprocess[];
  checks: ConcentrationCheck[];
}

export const EMPTY_ENDO: EndoDesk = { works: {}, reprocess: [], checks: [] };

export const newWork = (orderId: string, patientId: string, test: string): EndoWork => ({ orderId, patientId, test, prep: [], watch: [] });

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

export type EndoStatus = "予約" | "受付済み" | "検査中" | "実施済み" | "報告済み" | "中止";

export function statusOf(w: EndoWork | undefined): EndoStatus {
  if (!w) return "予約";
  if (w.notDone) return "中止";
  if (w.report) return "報告済み";
  if (w.done) return "実施済み";
  if (w.sedation || w.watch.length) return "検査中";
  if (w.arrived) return "受付済み";
  return "予約";
}

export interface EndoRow {
  orderId: string;
  patientId: string;
  name: string;
  room: string;
  test: string;
  testName: string;
  /** Minutes from today 00:00: the slot, else the order's time. */
  at: number;
  priority: PhysioOrder["when"]["priority"];
  purpose: string;
  comment?: string;
  transport?: string;
  orderedBy: string;
  status: EndoStatus;
  work?: EndoWork;
}

/** Endoscopies of yesterday to tomorrow, and older ones not reported yet. Stopped orders are left out. */
export function endoRows(people: { patient: Pick<Patient, "id" | "name">; room: string; entries: OrderEntry[] }[], desk: EndoDesk): EndoRow[] {
  const rows: EndoRow[] = [];
  for (const x of people) {
    for (const e of x.entries) {
      const o = e.order;
      if (o.type !== "physio" || e.status === "中止" || !ENDOSCOPY.includes(o.test)) continue;
      const w = desk.works[e.id];
      const status = statusOf(w);
      if (o.when.day > 1) continue;
      if (o.when.day < -1 && (status === "報告済み" || status === "中止")) continue;
      const ordered = examAt(o, abs(e.day, e.time));
      const at = w?.slot ? abs(Math.floor(ordered / 1440), w.slot.time) : ordered;
      rows.push({ orderId: e.id, patientId: x.patient.id, name: x.patient.name, room: x.room, test: o.test, testName: findPhysio(o.test)?.name ?? o.test, at, priority: o.when.priority, purpose: o.purpose, comment: o.comment, transport: o.transport, orderedBy: e.author, status, work: w });
    }
  }
  const rank: Record<EndoStatus, number> = { 検査中: 0, 受付済み: 1, 予約: 2, 実施済み: 3, 報告済み: 4, 中止: 5 };
  return rows.sort((a, b) => rank[a.status] - rank[b.status] || (a.priority === "至急" ? 0 : 1) - (b.priority === "至急" ? 0 : 1) || a.at - b.at);
}

// ---------------------------------------------------------------------------
// Scopes: which can be used now
// ---------------------------------------------------------------------------

export type ScopeState = "使用可" | "使用中" | "洗浄待ち" | "漏水テスト待ち" | "用手洗浄待ち" | "装置待ち" | "装置で消毒中" | "保管待ち" | "使用停止（漏水）";

/** The last reprocessing of the scope, if any. */
export const lastUse = (desk: EndoDesk, scope: string): Reprocess | undefined => desk.reprocess.filter((r) => r.scope === scope).at(-1);

export function scopeState(desk: EndoDesk, scope: string): ScopeState {
  const r = lastUse(desk, scope);
  if (!r) return "使用可";
  if (r.leak && !r.leak.ok) return "使用停止（漏水）";
  const w = desk.works[r.orderId];
  if (w && !w.done) return "使用中";
  if (!r.bedside) return "洗浄待ち";
  if (!r.leak) return "漏水テスト待ち";
  if (!r.manual) return "用手洗浄待ち";
  if (!r.machine) return "装置待ち";
  if (!r.machine.end) return "装置で消毒中";
  if (r.machine.ok === false) return "装置待ち";
  if (!r.stored) return "保管待ち";
  return "使用可";
}

/** The scopes of the kind that can be used for the next patient. */
export const usableScopes = (desk: EndoDesk, kind: ScopeKind): Scope[] => SCOPES.filter((s) => s.kind === kind && scopeState(desk, s.id) === "使用可");

/** The washer's check of the disinfectant today (the last one), or undefined. */
export const todayCheck = (desk: EndoDesk, washer: string): ConcentrationCheck | undefined => desk.checks.filter((c) => c.washer === washer && c.day === 0).at(-1);

/** Why the washer cannot be started now (null when it can). */
export function washerBlock(desk: EndoDesk, washer: string): string | null {
  const c = todayCheck(desk, washer);
  if (!c) return `${washer}：今日の消毒薬の濃度確認がまだです（使用前に確かめる）。`;
  if (!c.ok) return `${washer}：濃度が最低使用濃度を下回ったままです（交換して確かめ直す）。`;
  if (desk.reprocess.some((r) => r.machine?.washer === washer && !r.machine.end)) return `${washer}：消毒中のスコープがあります。`;
  return null;
}

/** The next step of reprocessing (for the button), or null when stored. */
export function nextReprocessStep(r: Reprocess): "ベッドサイド洗浄" | "漏水テスト" | "用手洗浄" | "装置で消毒" | "装置の終了" | "保管" | null {
  if (r.leak && !r.leak.ok) return null;
  if (!r.bedside) return "ベッドサイド洗浄";
  if (!r.leak) return "漏水テスト";
  if (!r.manual) return "用手洗浄";
  if (!r.machine || r.machine.ok === false) return "装置で消毒";
  if (!r.machine.end) return "装置の終了";
  if (!r.stored) return "保管";
  return null;
}

/** Minutes of disinfection still to go, or 0. */
export function machineLeft(r: Reprocess, nowAbs: number): number {
  if (!r.machine || r.machine.end) return 0;
  return Math.max(0, abs(r.machine.start.day, r.machine.start.time) + AGENT_MINUTES[r.machine.agent] - nowAbs);
}

// ---------------------------------------------------------------------------
// Sedation: gaps in the watch during the exam
// ---------------------------------------------------------------------------

const mins = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** Gaps longer than 5 minutes between observations from the start to the end of the exam (sedated only). */
export function watchGaps(w: EndoWork): { from: string; to: string; minutes: number }[] {
  if (!w.sedation || !w.done) return [];
  const pts = [...new Set([w.done.start, ...w.watch.map((x) => x.time).filter((t) => mins(t) >= mins(w.done!.start) && mins(t) <= mins(w.done!.end)), w.done.end])].sort((a, b) => mins(a) - mins(b));
  const out: { from: string; to: string; minutes: number }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const gap = mins(pts[i]) - mins(pts[i - 1]);
    if (gap > 5) out.push({ from: pts[i - 1], to: pts[i], minutes: gap });
  }
  return out;
}

/** What stops the 実施記録. */
export function doneProblems(d: { start: string; end: string; scope: string; doctor: string }, usable: string[]): string[] {
  const out: string[] = [];
  if (!/^\d{2}:\d{2}$/.test(d.start) || !/^\d{2}:\d{2}$/.test(d.end)) out.push("開始と終了の時刻（HH:MM）");
  else if (mins(d.end) < mins(d.start)) out.push("終了が開始より前です");
  if (!d.scope) out.push("使ったスコープ");
  else if (!usable.includes(d.scope)) out.push(`${d.scope} は洗浄・消毒が済んでいないため使えません`);
  if (!d.doctor.trim()) out.push("実施医");
  return out;
}

/** What stops the report. */
export function endoReportProblems(r: Pick<EndoReport, "findings" | "diagnosis" | "reason">, hadReport: boolean): string[] {
  const out: string[] = [];
  if (!r.findings.trim()) out.push("所見を書いてください。");
  if (!r.diagnosis.trim()) out.push("診断を書いてください。");
  if (hadReport && !r.reason?.trim()) out.push("訂正の理由を書いてください。");
  return out;
}

export const versionOf = (w: EndoWork) => (w.report ? (w.earlier?.length ?? 0) + 1 : 0);

/** Reports as results the ordering doctor marks as read (a corrected report is a new result). */
export function endoResultItems(desk: EndoDesk): ResultItem[] {
  return Object.values(desk.works)
    .filter((w) => w.report)
    .map((w) => {
      const r = w.report!;
      const v = versionOf(w);
      return {
        key: `endo|${w.orderId}|v${v}`,
        patientId: w.patientId,
        kind: "内視鏡" as const,
        day: r.day,
        time: r.time,
        title: `${findPhysio(w.test)?.name ?? w.test}${v > 1 ? "（訂正）" : ""}`,
        detail: `${r.diagnosis.split(/\n/)[0]}${w.done?.biopsy ? `（生検 ${w.done.biopsy}個）` : ""}`,
        panic: [],
        ...(v > 1 ? { corrected: `訂正（第${v}版）：${r.reason ?? ""}（${r.time} ${r.by}）` } : {}),
      };
    });
}

/** The 病理 request made from the biopsy (組織診・内視鏡下生検); the doctor fills in the rest. */
export function biopsyCase(w: EndoWork, at: Moment, by: string, f: { site: string; containers: number; clinical: string; question: string }): PathCase {
  return {
    id: `path-endo-${w.orderId}`,
    patientId: w.patientId,
    kind: "組織診",
    site: f.site.trim(),
    method: "内視鏡下生検",
    containers: f.containers,
    clinical: f.clinical.trim(),
    question: f.question.trim(),
    fixed: at,
    ordered: { ...at, by },
    steps: [],
  };
}

// ---------------------------------------------------------------------------
// The fictional demo: endoscopies of today for patients of 消化器内科, at different steps
// ---------------------------------------------------------------------------

const hhmm = (a: number) => {
  const m = Math.min(Math.max(a, 0), 1439);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

type Pick4 = Pick<Patient, "id" | "department" | "history">;

/** Up to four inpatients of 消化器内科 without an endoscopy already ordered (the same ones every time). */
export function demoEndoPatients(patients: Pick4[]): string[] {
  return patients
    .filter((p) => p.department === "消化器内科" && !p.history.some((h) => h.kind === "order" && h.order.type === "physio" && ENDOSCOPY.includes(h.order.test)))
    .map((p) => p.id)
    .sort()
    .slice(0, 4);
}

/** Endoscopies ordered for the demo patients (merged into their records like the demo physiological tests). */
export function demoEndoOrders(ids: string[], nowAbs: number): Record<string, OrderEntry[]> {
  const DR = "消化器内科 石川（架空）";
  const plan: { test: string; back: number; purpose: string; transport: "独歩" | "車椅子" }[] = [
    { test: "PHY-EGD", back: 180, purpose: "黒色便とHbの低下。上部消化管出血の有無。", transport: "車椅子" },
    { test: "PHY-EGD", back: 75, purpose: "心窩部痛が続く。潰瘍・腫瘍の有無。", transport: "独歩" },
    { test: "PHY-CF", back: -30, purpose: "便潜血陽性と貧血。大腸の腫瘍の有無。", transport: "車椅子" },
    { test: "PHY-EGD", back: -150, purpose: "胃潰瘍の治療後。治り具合の確認。", transport: "独歩" },
  ];
  const out: Record<string, OrderEntry[]> = {};
  ids.forEach((id, i) => {
    const p = plan[i];
    if (!p) return;
    const order: PhysioOrder = { type: "physio", test: p.test, purpose: p.purpose, when: { day: 0, time: hhmm(nowAbs - p.back), priority: "予約" }, place: "検査室", transport: p.transport };
    out[id] = [{ kind: "order", id: `o-endo-demo${i + 1}`, day: -1, time: "15:30", author: DR, status: "有効", order }];
  });
  return out;
}

/** Where the demo starts: the first exam reported (not read), the second done with biopsies, the third taken in. */
export function initialEndo(ids: string[], nowAbs: number): EndoDesk {
  const at = (back: number): Moment => ({ day: 0, time: hhmm(nowAbs - back) });
  const NS = "看護師 小川（架空）";
  const DR = "消化器内科 石川（架空）";
  const works: Record<string, EndoWork> = {};
  const reprocess: Reprocess[] = [];
  const t = (back: number) => hhmm(nowAbs - back);
  if (ids[0]) {
    works["o-endo-demo1"] = {
      ...newWork("o-endo-demo1", ids[0], "PHY-EGD"),
      arrived: { ...at(195), by: NS },
      prep: [
        { what: "消泡剤を内服", time: t(190), by: NS },
        { what: "咽頭麻酔（リドカインのスプレー）", time: t(185), by: NS },
      ],
      sedation: { drugs: [{ name: "ミダゾラム", dose: "2mg", route: "静注", time: t(181) }], o2: "鼻カニュラ 2L/分", doctor: DR, nurse: NS },
      watch: [
        { time: t(181), consciousness: "清明", hr: 82, sbp: 128, dbp: 74, spo2: 98, by: NS },
        { time: t(176), consciousness: "呼びかけで開眼", hr: 76, sbp: 118, dbp: 70, spo2: 97, by: NS },
        { time: t(171), consciousness: "呼びかけで開眼", hr: 74, sbp: 116, dbp: 68, spo2: 97, by: NS },
        { time: t(166), consciousness: "呼びかけで開眼", hr: 75, sbp: 120, dbp: 70, spo2: 98, by: NS },
        { time: t(130), consciousness: "清明", hr: 78, sbp: 124, dbp: 72, spo2: 98, by: NS },
      ],
      done: { day: 0, start: t(180), end: t(166), scope: "GIF-01", doctor: DR, assist: NS, biopsy: 0, procedures: "なし", complication: "なし" },
      release: { ...at(125), by: DR, assessment: "意識清明、呼吸は落ち着き SpO2 98%（室内気）、血圧・脈拍は検査前と同じ程度、歩いてトイレに行ける。" },
      report: {
        ...at(110),
        findings: "食道：異常なし。胃：体下部小彎に白苔の付いた潰瘍（約12mm）、露出血管なし、出血なし。十二指腸：異常なし。",
        diagnosis: "胃潰瘍（活動期、出血の跡なし）",
        by: DR,
      },
    };
    reprocess.push({ id: "rp-demo1", scope: "GIF-01", orderId: "o-endo-demo1", patientId: ids[0], used: at(166), bedside: { ...at(164), by: NS }, leak: { ...at(160), by: NS, ok: true }, manual: { ...at(150), by: NS }, machine: { washer: WASHERS[0], agent: "過酢酸", start: at(145), end: at(120), by: NS, ok: true }, stored: { ...at(115), by: NS } });
  }
  if (ids[1]) {
    works["o-endo-demo2"] = {
      ...newWork("o-endo-demo2", ids[1], "PHY-EGD"),
      arrived: { ...at(90), by: NS },
      prep: [
        { what: "消泡剤を内服", time: t(85), by: NS },
        { what: "咽頭麻酔（リドカインのスプレー）", time: t(80), by: NS },
      ],
      watch: [],
      done: { day: 0, start: t(75), end: t(60), scope: "GIF-02", doctor: DR, assist: NS, biopsy: 2, procedures: "胃前庭部の隆起から生検2個", complication: "なし" },
    };
    reprocess.push({ id: "rp-demo2", scope: "GIF-02", orderId: "o-endo-demo2", patientId: ids[1], used: at(60), bedside: { ...at(58), by: NS } });
  }
  if (ids[2]) {
    works["o-endo-demo3"] = {
      ...newWork("o-endo-demo3", ids[2], "PHY-CF"),
      arrived: { ...at(60), by: NS },
      prep: [
        { what: "腸管洗浄剤 2L を内服（6時〜8時）", time: "08:00", by: "病棟 看護師（架空）" },
        { what: "排便の状態：黄色の透明な水様", time: t(45), by: NS },
      ],
      watch: [],
    };
  }
  return { works, reprocess, checks: [{ washer: WASHERS[0], day: 0, time: "08:10", by: NS, ok: true, note: "テストストリップで確認" }] };
}
