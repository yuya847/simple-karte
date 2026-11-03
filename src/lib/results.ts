// Results the doctor has not yet seen, and panic values the laboratory must phone in.
// Which results are new, which values cross a panic limit and what is still unconfirmed are all
// worked out by code. A person phones, a person reads back, and the doctor marks a result as seen.

import { ANALYTES, rangeFor } from "./master";
import type { CultureResult, DayOffset, LabResult, Patient } from "./types";

export type ResultKind = "検査" | "画像" | "培養";

export interface ResultItem {
  key: string;
  patientId: string;
  kind: ResultKind;
  day: DayOffset;
  time: string;
  title: string;
  /** Short lines: out-of-range values, the first sentence of a report, the organism. */
  detail: string;
  /** Values beyond a panic limit (laboratory results only). */
  panic: PanicHit[];
  /** The laboratory corrected this result (訂正): what changed, why, who and when. */
  corrected?: string;
}

export interface PanicLimit {
  code: string;
  low?: number;
  high?: number;
}

export interface PanicHit {
  code: string;
  name: string;
  value: number;
  unit: string;
  side: "低" | "高";
  limit: number;
}

/** One try at reaching a doctor about a panic value. Only 伝えた (told directly) is a report. */
export interface ContactAttempt {
  at: { day: DayOffset; time: string };
  by: string;
  to: string;
  means: "電話" | "対面";
  result: "伝えた" | "つながらない（不在・話し中）" | "伝言・折り返しを頼んだ";
}

/** A panic value phoned to the ward (who called, who took it, whether it was read back). */
export interface PanicCall {
  key: string;
  patientId: string;
  hits: PanicHit[];
  by: string;
  to: string;
  means: "電話" | "対面";
  readBack: boolean;
  at: { day: DayOffset; time: string };
  /** Why the value could not be read back (written by the technologist when readBack is false). */
  noReadBack?: string;
  /** Every try, oldest first; the last one is the report. */
  attempts?: ContactAttempt[];
}

export interface Ack {
  by: string;
  at: { day: DayOffset; time: string };
  /** For a panic value: what the doctor did (提言第20号 提言3; 医療安全情報 No.236). */
  response?: string;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/**
 * A result the laboratory entered in this session also carries its label code (two orders may share a
 * draw time). A corrected result carries its version, so the doctor sees it again as not yet seen and
 * a panic value in it is phoned in again.
 */
export const labKey = (pid: string, l: LabResult) => `lab|${pid}|${l.day}|${l.time}${l.id ? `|${l.id}` : ""}${l.corrected ? `|v${l.corrected.version}` : ""}`;

/** What a correction changed, in one line (saying which of the values it replaced were panic values). */
export function correctedLine(l: LabResult, limits: PanicLimit[]): string | undefined {
  const c = l.corrected;
  if (!c) return undefined;
  const codes = ANALYTES.filter((a) => a.code in c.before && a.code in l.values && c.before[a.code] !== l.values[a.code]);
  const changed = codes.map((a) => `${a.name} ${fmt(c.before[a.code])}→${fmt(l.values[a.code])}`);
  const wasPanic = panicOf(c.before, limits).filter((h) => codes.some((a) => a.code === h.code));
  return `訂正（第${c.version}版）：${changed.join("、")}${wasPanic.length ? `（訂正前の${wasPanic.map((h) => h.name).join("・")}はパニック値）` : ""}　理由：${c.reason}（${c.at.time} ${c.by}）`;
}

/** Values beyond the panic limits of the fictional hospital. */
export function panicOf(values: Record<string, number>, limits: PanicLimit[]): PanicHit[] {
  const out: PanicHit[] = [];
  for (const lim of limits) {
    const v = values[lim.code];
    if (v === undefined) continue;
    const a = ANALYTES.find((x) => x.code === lim.code);
    const base = { code: lim.code, name: a?.name ?? lim.code, value: v, unit: a?.unit ?? "" };
    if (lim.low !== undefined && v <= lim.low) out.push({ ...base, side: "低", limit: lim.low });
    else if (lim.high !== undefined && v >= lim.high) out.push({ ...base, side: "高", limit: lim.high });
  }
  return out;
}

/** A blood culture that has turned positive is phoned in like a panic value. */
export function bloodCulturePanic(c: CultureResult): PanicHit[] {
  if (c.specimen !== "血液" || c.status !== "中間報告" || !(c.gram || c.organism)) return [];
  return [{ code: "BC", name: `血液培養陽性（${c.gram ?? c.organism}）`, value: NaN, unit: "", side: "高", limit: NaN }];
}

export const hitLine = (h: PanicHit) =>
  Number.isNaN(h.value) ? h.name : `${h.name} ${fmt(h.value)}${h.unit ? ` ${h.unit}` : ""}（${h.side === "低" ? `${fmt(h.limit)}以下` : `${fmt(h.limit)}以上`}）`;

/** Every result of a patient as an item to see, newest first. */
export function resultsOf(p: Patient, limits: PanicLimit[]): ResultItem[] {
  const out: ResultItem[] = [];
  for (const l of p.labs) {
    const abnormal = Object.entries(l.values).flatMap(([code, v]) => {
      const a = ANALYTES.find((x) => x.code === code);
      if (!a) return [];
      const r = rangeFor(a, p.sex);
      if (r.low !== undefined && v < r.low) return [`${a.name} ${fmt(v)}L`];
      if (r.high !== undefined && v > r.high) return [`${a.name} ${fmt(v)}H`];
      return [];
    });
    out.push({
      key: labKey(p.id, l),
      patientId: p.id,
      kind: "検査",
      day: l.day,
      time: l.time,
      title: `検体検査 ${Object.keys(l.values).length}項目${l.corrected ? "（訂正）" : ""}`,
      detail: abnormal.length ? `基準範囲の外：${abnormal.join("、")}` : "すべて基準範囲の中",
      panic: panicOf(l.values, limits),
      ...(l.corrected ? { corrected: correctedLine(l, limits) } : {}),
    });
  }
  for (const s of p.imaging) {
    if (s.pending) continue;
    out.push({
      key: `img|${s.id}`,
      patientId: p.id,
      kind: "画像",
      day: s.day,
      time: s.time ?? "",
      title: `${s.modality} ${s.region}（${s.reader}）`,
      detail: s.report.split(/(?<=。)/)[0],
      panic: [],
    });
  }
  for (const c of p.cultures) {
    if (c.status === "培養中") continue;
    out.push({
      key: `cx|${p.id}|${c.collectedOn}|${c.specimen}|${c.status}`,
      patientId: p.id,
      kind: "培養",
      day: c.reportedOn ?? c.collectedOn,
      time: c.reportedTime ?? "",
      title: `${c.specimen}培養 ${c.status}${c.sets ? `（${c.sets}）` : ""}`,
      detail: c.organism ?? c.gram ?? "",
      panic: bloodCulturePanic(c),
    });
  }
  return out.sort((a, b) => b.day - a.day || b.time.localeCompare(a.time));
}

/**
 * Results not yet seen. Results from before today count as seen by the attending (the fictional
 * record has no 既読 for them); from today on, the doctor marks each one.
 */
export function unseen(items: ResultItem[], acks: Record<string, Ack>): ResultItem[] {
  return items.filter((i) => i.day >= 0 && !acks[i.key]);
}

/** Panic values found but not phoned in yet, whatever their day (one left over stays until reported). */
export function uncalled(items: ResultItem[], calls: Record<string, PanicCall>): ResultItem[] {
  return items.filter((i) => i.panic.length > 0 && !calls[i.key]);
}

/** What the laboratory lists: results from today on, and any panic value not reported yet. */
export const labBoard = (items: ResultItem[], calls: Record<string, PanicCall>) => items.filter((i) => i.day >= 0 || (i.panic.length > 0 && !calls[i.key]));

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * The fictional event of this demo: 大浦さんの血液培養（昨日 2セット採取）が、セッションを始める少し前に
 * 1セットで陽性になり、グラム染色の中間報告が出た。
 */
export function cultureArrivals(nowAbs: number): Record<string, CultureResult[]> {
  const t = Math.max(0, Math.min(1439, nowAbs - 12));
  return {
    "90010244": [{ collectedOn: -1, specimen: "血液", sets: "2セット中1セット陽性", status: "中間報告", reportedOn: 0, reportedTime: hhmm(t), gram: "グラム陽性球菌（ブドウ状）" }],
  };
}

/** A culture reported later replaces the earlier report of the same specimen. */
export function mergeCultures(base: CultureResult[], later: CultureResult[] = []): CultureResult[] {
  const same = (a: CultureResult, b: CultureResult) => a.collectedOn === b.collectedOn && a.specimen === b.specimen;
  return [...base.filter((c) => !later.some((l) => same(c, l))), ...later];
}

/**
 * Panic limits of the fictional hospital: the examples in the JSLM table (2024年改定版 別表, the same
 * values as the 2021 table), for the analytes this chart has. Each hospital sets its own limits.
 */
export const PANIC_LIMITS: PanicLimit[] = [
  { code: "Glu", low: 50, high: 500 },
  { code: "Na", low: 115, high: 165 },
  { code: "K", low: 1.5, high: 7.0 },
  { code: "Cl", high: 120 },
  { code: "Ca", low: 6.0, high: 12.0 },
  { code: "BUN", high: 80 },
  { code: "TP", low: 4.0, high: 10.0 },
  { code: "Alb", low: 2.0, high: 6.0 },
  { code: "UA", low: 1.0, high: 10.0 },
  { code: "AST", high: 300 },
  { code: "ALT", high: 300 },
  { code: "LDH", high: 1000 },
  { code: "AMY", high: 1000 },
  { code: "Cre", high: 3.0 },
  { code: "CK", high: 5000 },
  { code: "ChE", low: 20 },
  // 乳酸 5.0 mmol/L, in this chart's unit (mg/dL): 5.0 × 9.01 ≈ 45.
  { code: "Lac", high: 45 },
  { code: "WBC", low: 1500, high: 20000 },
  { code: "Hb", low: 5, high: 20 },
  { code: "Plt", low: 3, high: 100 },
  { code: "PT-INR", high: 2.0 },
  { code: "Fib", low: 100, high: 700 },
  { code: "FDP", high: 20 },
];
export const PANIC_SOURCE =
  "日本臨床検査医学会「臨床検査『パニック値』運用に関する提言書（2024年改定版）」別表の例を、架空の病院の値として使っています（閾値は医療機関ごとに決めるもの）。グルコースの高値は入院の値、クレアチニンは急性腎不全の例、PT-INR はワルファリン治療中でないときの例、乳酸は 5.0 mmol/L を mg/dL に換算。境界の値を含めて判定します。連絡の手順は医療事故調査・支援センター「医療事故の再発防止に向けた提言 第20号」（2024年12月）：オーダーした医師に電話か対面で直接伝え、最後に復唱してもらい、検査室は報告の記録を、医師は対応の記録を残します。";

/** Where the patient is: a ward chart, or a visit of 救急外来 / 外来 (ids "er:◯" / "opd:◯", like the visit tabs). */
export type Place = "病棟" | "救急" | "外来";
export const placeOf = (patientId: string): Place => (patientId.startsWith("er:") ? "救急" : patientId.startsWith("opd:") ? "外来" : "病棟");

const dayWord = (d: DayOffset) => (d === 0 ? "今日" : d === 1 ? "明日" : d === -1 ? "昨日" : d > 0 ? `${d}日後` : `${-d}日前`);

/** What to say on the phone, in the order of 提言第20号 図2 (put together by code). */
export function callScript(item: ResultItem, p: { name: string; id: string }, room: string): string[] {
  return [
    "「パニック値の報告です」",
    { 病棟: `① 入院（5階東 ${room}）`, 救急: "① 救急外来", 外来: "① 外来" }[placeOf(item.patientId)],
    `② ${p.name}さん（ID ${p.id}）`,
    `③ ${item.kind === "培養" ? "報告" : "採取"} ${dayWord(item.day)} ${item.time || "—"}`,
    `④ ${item.panic.map(hitLine).join("、")}`,
    "「復唱をお願いします」",
  ];
}

// ---------------------------------------------------------------------------
// The call itself: tries that did not reach anyone, then the report (read back, or why not).
// ---------------------------------------------------------------------------

/**
 * The fictional hospital's rule when the ordering doctor cannot be reached. 提言第20号 asks for the
 * report to go straight to the doctor who ordered the test, so a message left with someone is not a
 * report and the laboratory keeps trying.
 */
export const PANIC_REACH_RULE = {
  /** Tries that did not reach the ordering doctor before going to another doctor. */
  triesBeforeOthers: 2,
  text: "この架空の病院の取り決め：オーダーした医師につながらなければかけ直します。2回つながらなければ同じ科の医師へ、それでもつながらなければ管理当直へ連絡します。伝言は報告に数えません（直接伝えてから「報告した」）。",
} as const;

/** Who the laboratory may phone, in the order of the rule. */
export const reachList = (attending: string) => [`主治医 ${attending}（オーダーした医師）`, "同じ科の医師", "管理当直"];

/** Tries that did not reach anyone, and whether the rule says to go on to another doctor. */
export function reachState(tries: ContactAttempt[]): { failed: number; goOthers: boolean } {
  const failed = tries.filter((t) => t.result !== "伝えた").length;
  return { failed, goOthers: failed >= PANIC_REACH_RULE.triesBeforeOthers };
}

/** 報告した needs a person on the line, and the value read back — or a written reason why it was not. */
export function canReport(to: string, readBack: boolean, noReadBack: string): boolean {
  return !!to.trim() && (readBack || !!noReadBack.trim());
}

/** The report, with every try before it (oldest first; the last one is the report). */
export function reportCall(
  item: Pick<ResultItem, "key" | "patientId" | "panic">,
  tries: ContactAttempt[],
  r: { by: string; to: string; means: PanicCall["means"]; readBack: boolean; noReadBack?: string; at: { day: DayOffset; time: string } },
): PanicCall {
  const to = r.to.trim();
  const last: ContactAttempt = { at: r.at, by: r.by, to, means: r.means, result: "伝えた" };
  const reason = r.readBack ? undefined : r.noReadBack?.trim() || undefined;
  return { key: item.key, patientId: item.patientId, hits: item.panic, by: r.by, to, means: r.means, readBack: r.readBack, at: r.at, ...(reason ? { noReadBack: reason } : {}), attempts: [...tries, last] };
}

/** One line for the audit log and the doctor's inbox. */
export function callLine(c: PanicCall): string {
  const n = c.attempts?.length ?? 1;
  return `${c.at.time} ${c.by} → ${c.to}（${c.means}・${c.readBack ? "復唱あり" : `復唱なし：${c.noReadBack ?? "理由の記録なし"}`}${n > 1 ? `・${n}回目の連絡で報告` : ""}）`;
}
