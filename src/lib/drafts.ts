// Order drafts and the rule-based checks that run on them.
//
// Claude only fills in what the doctor said (see ai-schema.ts). Everything here is plain
// code: unit checks, volume/time/rate arithmetic, duplicates, date interpretation and
// missing fields. Every question offers choices; the doctor picks. Nothing is recommended.

import type { AiDraftResponse, AiOrder } from "./ai-schema";
import { minutesOf } from "./dates";
import { DRUGS, LAB_TESTS, ORDER_SETS, WARD_RULES, anyDrugName, findDrug, findLab, findOralDrug, findSet, type DrugMaster, KCL_LIMITS } from "./master";
import {
  AREA_CLASSES,
  AREA_LABEL,
  DEPTHS,
  DEPTH_LABEL,
  O2_DEVICES,
  O2_DEVICE_NAMES,
  PROCEDURES,
  PROC_DRUGS,
  areaClassOf,
  HD_UF_RATE,
  GUIDE_TO,
  TX_DO,
  TX_PRODUCTS,
  TX_USE,
  findProc,
  findProcDrug,
  hdText,
  hdUfRate,
  isSevereUlcer,
  txEffect,
  txMinutes,
  txText,
  txVolume,
  parseSize,
  procScheduleText,
  type AreaClass,
  type O2Device,
  type ProcMaster,
  type ProcSchedule,
  type UlcerDepth,
} from "./procedures";
import type {
  DayOffset,
  HdOrder,
  InjectionOrder,
  Patient,
  TxOrder,
  RehabOrder,
  ConsultOrder,
  LeaveOrder,
  GuideOrder,
  MoveOrder,
  InjectionRoute,
  InjectionSchedule,
  LabOrder,
  LabPriority,
  Order,
  OrderEntry,
  ProcedureOrder,
} from "./types";
import { checkPrescription, toPrescriptionOrders, type PrescriptionDraft } from "./rx";
import { consentFor, findConsent, type ConsentCode } from "./consent";
import { PHYSIO, REGIONS, checkImaging, checkPhysio, emptyImaging, emptyPhysio, toImagingOrder, toPhysioOrder, type ExamPatientFacts, type ImagingDraft, type Modality, type PhysioDraft } from "./exams";

/** 移動 said in words (code reads the words). */
function transportFromWords(w: string) {
  if (/ストレッチャー/.test(w)) return "ストレッチャー" as const;
  if (/車椅子|車いす/.test(w)) return "車椅子" as const;
  if (/独歩|歩いて/.test(w)) return "独歩" as const;
  return null;
}

/**
 * The region of the master these words name (code, not Claude, decides). The longest name
 * wins ("胸腹部" over "腹"); whether the modality is done for it is checked afterwards.
 */
export function regionFromWords(words: string, _modality?: Modality | null): string | null {
  const w = words.normalize("NFKC").replace(/\s/g, "");
  if (!w) return null;
  let best: { code: string; len: number } | null = null;
  for (const r of REGIONS) {
    for (const a of [r.name, ...r.aliases]) {
      if (w.includes(a) && (!best || a.length > best.len)) best = { code: r.code, len: a.length };
    }
  }
  return best?.code ?? null;
}

export type { ImagingDraft, PhysioDraft } from "./exams";

export type { PrescriptionDraft } from "./rx";

// ---------------------------------------------------------------------------
// Draft types
// ---------------------------------------------------------------------------

interface DraftBase {
  id: string;
  origin: "ai" | "manual";
  sourceText: string;
  comment: string | null;
}

export interface DraftItem {
  drugCode: string | null;
  said: string;
  amount: number | null;
  unit: string | null;
}

export interface InjectionDraft extends DraftBase {
  kind: "injection";
  items: DraftItem[];
  route: InjectionRoute | null;
  schedule: InjectionSchedule | null;
  infusionMinutes: number | null;
  infusionScope: "per_dose" | "whole_day" | "unclear" | null;
  rateMlPerH: number | null;
  /** Doctor's answer when the said rate and the said time disagree. */
  prefer: "time" | "rate" | null;
  start: { day: DayOffset | null; time: string | null };
  days: number | null;
  /** Doctor's answer to the duplicate question. */
  duplicate: { action: "replace" | "add"; orderId: string } | null;
}

export type CollectWhen = "morning_routine" | "now" | "specific_time" | "before_dose";

export interface LabDraft extends DraftBase {
  kind: "lab";
  tests: { code: string | null; said: string }[];
  collect: {
    day: DayOffset | null;
    when: CollectWhen | null;
    time: string | null;
    beforeDose: { n: number | null; drugCode: string | null } | null;
  };
  priority: LabPriority | null;
  cultureSets: number | null;
  duplicateOk: boolean;
}

export interface ProcedureDraft extends DraftBase {
  kind: "procedure";
  code: string | null;
  said: string;
  site: string | null;
  /** Lengths or area read from the words (parseSize). The area class is computed from them in code. */
  size: { lengthCm: number | null; widthCm: number | null; areaCm2: number | null };
  /** The size words, when they could not be read as a size. */
  sizeSaid?: string | null;
  /** Area class chosen by the doctor when no size was said. */
  area: AreaClass | null;
  depth: UlcerDepth | null;
  o2: { device: O2Device | null; lpm: number | null };
  /** 透析の条件 (PROC-HD), entered in the 透析 panel. */
  hd?: HdOrder | null;
  /** Doctor's answer when the ultrafiltration rate is over the guideline's mark. */
  hdOk?: boolean;
  /** 輸血 (PROC-TX), entered in the 輸血 panel. */
  tx?: TxOrder | null;
  rehab?: RehabOrder | null;
  consult?: ConsultOrder | null;
  leave?: LeaveOrder | null;
  guide?: GuideOrder | null;
  move?: MoveOrder | null;
  schedule: ProcSchedule | null;
  start: { day: DayOffset | null; time: string | null };
  days: number | null;
  drug: { code: string | null; said: string; amount: number | null } | null;
  /** Doctor's answer when the flow is outside the ward's usual range for the device. */
  flowOk: boolean;
  /** Prepare the consent form with the order. */
  consentPlanned?: boolean;
  duplicate: { action: "replace" | "add"; orderId: string } | null;
}

export interface StopDraft extends DraftBase {
  kind: "stop";
  drugCode: string | null;
  /** Set instead of drugCode when a procedure (酸素, 留置カテーテル …) is stopped. */
  procCode?: string | null;
  said: string;
  targetOrderId: string | null;
}

/** 延長: add days to a running order that has an end (日数). Confirmed like any other draft. */
export interface ExtendDraft extends DraftBase {
  kind: "extend";
  targetOrderId: string;
  /** Days added to the order's 日数. */
  addDays: number;
}

export interface UnclearDraft extends DraftBase {
  kind: "unclear";
  reason: string;
}

export type Draft = InjectionDraft | LabDraft | ProcedureDraft | PrescriptionDraft | ImagingDraft | PhysioDraft | StopDraft | ExtendDraft | UnclearDraft;

// ---------------------------------------------------------------------------
// From Claude's output to drafts (codes not in the master are dropped to null)
// ---------------------------------------------------------------------------

const DAY: Record<string, DayOffset | null> = { today: 0, tomorrow: 1, day_after_tomorrow: 2, unspecified: null };

const validDrug = (code: string | null) => (code && findDrug(code) ? code : null);
const validLab = (code: string | null) => (code && (findLab(code) || findSet(code)) ? code : null);
const validProc = (code: string | null | undefined) => (code && findProc(code) ? code : null);
const validProcDrug = (code: string | null | undefined) => (code && findProcDrug(code) ? code : null);

function procScheduleFrom(f: AiOrder["frequency"], prn: string | null): ProcSchedule | null {
  // (prn: the condition words, which Claude puts in the comment)
  if (f.kind === "prn") return prn ? { kind: "prn", condition: prn } : { kind: "prn" };
  if (f.kind === "once") return { kind: "once" };
  if (f.kind === "continuous") return { kind: "continuous" };
  if (f.value === null || f.value <= 0) return null;
  if (f.kind === "per_day") return { kind: "per_day", count: f.value };
  if (f.kind === "every_days") return { kind: "every_days", days: f.value };
  return null;
}

const text = (s: string) => (s.trim() ? s.trim() : null);
const said = (n: number) => (n > 0 ? n : null);

function sizeFrom(words: string | null): Pick<ProcedureDraft, "size" | "sizeSaid"> {
  const none = { lengthCm: null, widthCm: null, areaCm2: null };
  if (!words) return { size: none, sizeSaid: null };
  const p = parseSize(words);
  if (!p) return { size: none, sizeSaid: words };
  return { size: "areaCm2" in p ? { ...none, areaCm2: p.areaCm2 } : { ...none, lengthCm: p.lengthCm, widthCm: p.widthCm }, sizeSaid: null };
}
const asDepth = (s: string | null): UlcerDepth | null => (s && (DEPTHS as string[]).includes(s) ? (s as UlcerDepth) : null);
const asDevice = (s: string | null): O2Device | null => (s && (O2_DEVICE_NAMES as string[]).includes(s) ? (s as O2Device) : null);

/** An empty procedure draft for a master item, picked by hand. The checks then ask what is missing. */
export function newProcedureDraft(code: string, id: string): ProcedureDraft {
  return {
    id,
    origin: "manual",
    sourceText: "（マスターから選択）",
    comment: null,
    kind: "procedure",
    code,
    said: findProc(code)?.name ?? code,
    site: null,
    size: { lengthCm: null, widthCm: null, areaCm2: null },
    area: null,
    depth: null,
    o2: { device: null, lpm: null },
    schedule: null,
    start: { day: null, time: null },
    days: null,
    drug: null,
    flowOk: false,
    duplicate: null,
  };
}

function scheduleFrom(f: AiOrder["frequency"]): InjectionSchedule | null {
  if (f.kind === "once") return { kind: "once" };
  if (f.value === null || f.value <= 0) return null;
  if (f.kind === "per_day") return { kind: "per_day", count: f.value };
  if (f.kind === "every_hours") return { kind: "every_hours", hours: f.value };
  return null;
}

/**
 * Whether "N時間で" is said right after a per-bag or whole-day phrase. Claude's reading of
 * this is not stable from run to run, so for several bags a day the code decides from the
 * words: if they do not say it, the doctor is asked.
 */
export function scopeFromWords(text: string): "per_dose" | "whole_day" | null {
  const t = text.normalize("NFKC").replace(/\s/g, "");
  const time = String.raw`[0-9.]+時間`;
  if (new RegExp(String.raw`(1(本|袋)(あたり)?|各)(を|は)?(${time})`).test(t)) return "per_dose";
  if (new RegExp(String.raw`([2-9](本|袋)|全部|合計|1日分|1日量)(を|は)?(${time})`).test(t)) return "whole_day";
  return null;
}

export function draftsFromAi(res: AiDraftResponse, newId: () => string): Draft[] {
  const drafts: Draft[] = [];
  for (const o of res.orders) {
    const base = { id: newId(), origin: "ai" as const, sourceText: o.source_text, comment: o.comment };
    if (o.kind === "stop") {
      const d = o.drugs[0];
      if (!d && text(o.procedure_code)) {
        drafts.push({ ...base, kind: "stop", drugCode: null, procCode: validProc(text(o.procedure_code)), said: o.source_text, targetOrderId: null });
      } else {
        drafts.push({ ...base, kind: "stop", drugCode: validDrug(d?.code ?? null), said: d?.said ?? o.source_text, targetOrderId: null });
      }
    } else if (o.kind === "imaging" || o.kind === "physio") {
      const priority = o.priority === "至急" ? ("至急" as const) : o.start.time || o.start.day !== "unspecified" ? ("予約" as const) : null;
      const when = { day: DAY[o.start.day] ?? (priority === "至急" ? 0 : null), time: o.start.time, priority };
      const purpose = o.exam_purpose.trim() || null;
      if (o.kind === "imaging") {
        const modality = (["X線", "ポータブルX線", "CT", "MRI"] as const).find((m) => m === o.exam) ?? null;
        drafts.push({
          ...emptyImaging(base.id, modality),
          origin: "ai",
          sourceText: o.source_text,
          comment: o.comment,
          region: regionFromWords(o.exam_region, modality),
          regionSaid: o.exam_region.trim(),
          contrast: o.exam_contrast || null,
          purpose,
          when,
          transport: modality === "ポータブルX線" ? "病室（ポータブル）" : transportFromWords(`${o.source_text}${o.comment ?? ""}`),
        });
      } else {
        const test = PHYSIO.find((p) => p.aliases.includes(o.exam) || p.name.startsWith(o.exam))?.code ?? null;
        const words = `${o.source_text}${o.comment ?? ""}`;
        const place = /ベッドサイド|病室で|ベッド上/.test(words) ? ("ベッドサイド" as const) : /検査室|生理検査室/.test(words) ? ("検査室" as const) : null;
        drafts.push({ ...emptyPhysio(base.id, test), origin: "ai", sourceText: o.source_text, comment: o.comment, said: o.exam || o.source_text, purpose, when, place, transport: transportFromWords(words) });
      }
    } else if (o.kind === "prescription") {
      const prn = o.rx_category === "頓用";
      const timings = prn ? [] : o.rx_timings.length ? o.rx_timings : null;
      const perDose = o.rx_amount_is === "1回量" || prn;
      drafts.push({
        ...base,
        comment: prn ? null : o.comment,
        kind: "prescription",
        category: o.rx_category === "定期" || o.rx_category === "臨時" || o.rx_category === "退院時" ? o.rx_category : null,
        items: o.drugs.map((d) => ({
          drugCode: d.code && findOralDrug(d.code) ? d.code : null,
          said: d.said,
          daily: perDose ? null : d.amount,
          perDose: perDose ? d.amount : null,
        })),
        timings,
        prn: prn ? (o.comment?.trim() || null) : null,
        maxPerDay: o.rx_max_per_day > 0 ? o.rx_max_per_day : null,
        days: o.days,
        start: { day: DAY[o.start.day] ?? null, timing: null },
        acks: [],
      });
    } else if (o.kind === "procedure") {
      const dr = o.drugs[0];
      const prn = o.frequency.kind === "prn";
      drafts.push({
        ...base,
        comment: prn ? null : o.comment,
        kind: "procedure",
        code: validProc(text(o.procedure_code)),
        said: o.source_text,
        site: text(o.site),
        ...sizeFrom(text(o.size_said)),
        area: null,
        depth: asDepth(text(o.depth)),
        o2: { device: asDevice(text(o.o2_device)), lpm: said(o.o2_lpm) },
        schedule: procScheduleFrom(o.frequency, prn ? (o.comment?.trim() || null) : null),
        start: { day: DAY[o.start.day] ?? null, time: o.start.time },
        days: o.days,
        drug: dr ? { code: validProcDrug(dr.code), said: dr.said, amount: dr.amount } : null,
        flowOk: false,
        duplicate: null,
      });
    } else if (o.kind === "injection") {
      const schedule = scheduleFrom(o.frequency);
      const severalBags = schedule?.kind === "per_day" && schedule.count > 1 && o.infusion.minutes !== null;
      drafts.push({
        ...base,
        kind: "injection",
        items: o.drugs.map((d) => ({ drugCode: validDrug(d.code), said: d.said, amount: d.amount, unit: d.unit })),
        route: o.route,
        schedule,
        infusionMinutes: o.infusion.minutes,
        infusionScope: severalBags ? (scopeFromWords(o.source_text) ?? "unclear") : o.infusion.applies_to,
        rateMlPerH: o.infusion.rate_ml_per_h,
        prefer: null,
        start: { day: DAY[o.start.day] ?? null, time: o.start.time },
        days: o.days,
        duplicate: null,
      });
    } else if (o.kind === "lab") {
      const when = o.collect.when === "unspecified" ? null : o.collect.when;
      drafts.push({
        ...base,
        kind: "lab",
        tests: o.tests.map((t) => ({ code: validLab(t.code), said: t.said })),
        collect: {
          day: DAY[o.collect.day] ?? null,
          when,
          time: o.collect.time,
          beforeDose: when === "before_dose" ? { n: o.collect.before_dose_number, drugCode: validDrug(o.collect.before_dose_drug_code) } : null,
        },
        priority: o.priority,
        cultureSets: o.culture_sets,
        duplicateOk: false,
      });
    }
  }
  for (const u of res.not_understood) {
    drafts.push({ id: newId(), origin: "ai", sourceText: u.source_text, comment: null, kind: "unclear", reason: u.reason });
  }
  return drafts;
}

// ---------------------------------------------------------------------------
// Arithmetic (shown to the doctor as formulas)
// ---------------------------------------------------------------------------

/** Volume of one dose in mL: fluids by bag size or mL, drugs (powder) count as 0. */
export function doseVolumeMl(items: Pick<DraftItem, "drugCode" | "amount" | "unit">[]): number {
  let total = 0;
  for (const it of items) {
    const d = it.drugCode ? findDrug(it.drugCode) : undefined;
    if (it.amount === null || !it.unit) continue;
    if (it.unit === "mL") total += it.amount;
    else if ((it.unit === "本" || it.unit === "袋") && d?.volumeMl) total += it.amount * d.volumeMl;
  }
  return total;
}

export function dosesPerDay(s: InjectionSchedule): number {
  if (s.kind === "per_day") return s.count;
  if (s.kind === "every_hours") return 24 / s.hours;
  return 1;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const hoursText = (min: number) => (min % 60 === 0 ? `${min / 60}時間` : `${round1(min / 60)}時間`);

export interface RatePlan {
  minutesPerDose: number | null;
  rateMlPerH: number | null;
  formula: string | null;
}

/** Work out per-dose time and rate from what was said. Ambiguous scope is left unresolved. */
export function ratePlan(d: InjectionDraft): RatePlan {
  const vol = doseVolumeMl(d.items);
  const n = d.schedule ? dosesPerDay(d.schedule) : 1;
  const scope = d.infusionScope === "unclear" && n <= 1 ? "per_dose" : d.infusionScope;

  let fromTime: { min: number; rate: number | null; formula: string } | null = null;
  if (d.infusionMinutes !== null && scope !== "unclear") {
    if (scope === "whole_day" && n > 1) {
      const min = d.infusionMinutes / n;
      fromTime = {
        min,
        rate: vol > 0 ? (vol * n) / (d.infusionMinutes / 60) : null,
        formula: vol > 0 ? `${vol}mL × ${n} ÷ ${hoursText(d.infusionMinutes)} = ${round1((vol * n) / (d.infusionMinutes / 60))}mL/時` : "",
      };
    } else {
      fromTime = {
        min: d.infusionMinutes,
        rate: vol > 0 ? vol / (d.infusionMinutes / 60) : null,
        formula: vol > 0 ? `${vol}mL ÷ ${hoursText(d.infusionMinutes)} = ${round1(vol / (d.infusionMinutes / 60))}mL/時` : "",
      };
    }
  }

  if (d.rateMlPerH !== null && (d.prefer === "rate" || !fromTime)) {
    const min = vol > 0 ? (vol / d.rateMlPerH) * 60 : null;
    return {
      minutesPerDose: min,
      rateMlPerH: d.rateMlPerH,
      formula: vol > 0 ? `${vol}mL ÷ ${d.rateMlPerH}mL/時 = 1回 ${hoursText(Math.round(min!))}` : null,
    };
  }
  if (fromTime) return { minutesPerDose: fromTime.min, rateMlPerH: fromTime.rate === null ? null : round1(fromTime.rate), formula: fromTime.formula || null };
  return { minutesPerDose: null, rateMlPerH: null, formula: null };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export type IssueLevel = "stop" | "ask" | "info";

export interface Choice {
  label: string;
  note?: string;
  apply?: (d: Draft) => Draft;
  remove?: boolean;
}

export interface Issue {
  key: string;
  level: IssueLevel;
  title: string;
  message: string;
  formula?: string;
  choices?: Choice[];
}

export interface CheckContext {
  /** Orders currently in effect (history and today's confirmed, minus stopped). */
  activeOrders: OrderEntry[];
  /** All lab orders not stopped, for same-day duplicate checks. */
  labOrders: OrderEntry[];
  /** The other drafts on screen (a level draw can be timed to a drug drafted alongside it). */
  drafts: Draft[];
  /** Current time in Japan, "HH:MM". */
  nowTime: string;
  /** "11/3（火）" for a day offset. */
  fmtDay: (d: DayOffset) => string;
  /** One-line description of an existing order. */
  describe: (o: OrderEntry) => string;
  /** The patient's allergies (for the prescription check). */
  allergies?: string[];
  /** Sex, age, allergies and the latest Cre (for contrast and pregnancy checks). */
  patientFacts?: ExamPatientFacts | null;
  /** For a transfusion: the blood type on the chart and the latest Hb, Plt and PT-INR. */
  txFacts?: { blood?: Patient["blood"]; latest: Record<string, { value: number; day: number } | undefined> } | null;
  /** Consent forms of this patient (code and status), for orders that need one. */
  consents?: { code: string; status: string }[];
}

/** An order that needs a consent form: in place, or to be prepared with the order. */
export function consentIssue(code: string | null, ctx: CheckContext, planned: boolean, apply: (x: Draft) => Draft): Issue | null {
  if (!code) return null;
  const name = findConsent(code as ConsentCode).short;
  const have = (ctx.consents ?? []).filter((c) => c.code === code);
  if (have.some((c) => c.status === "同意")) return { key: "consent", level: "info", title: "同意書", message: `${name}：同意あり` };
  if (planned || have.some((c) => c.status === "説明前")) return { key: "consent", level: "info", title: "同意書", message: `${name}：実施までに説明して同意を得る（同意書の下書きあり）` };
  return {
    key: "consent",
    level: "ask",
    title: "同意書",
    message: `${name}の説明・同意書が要ります（実施の前に）。`,
    choices: [{ label: "同意書を用意する（確定すると下書きができる）", apply }],
  };
}

function drugCandidates(said: string): DrugMaster[] {
  const s = said.replace(/\s/g, "");
  if (!s) return [];
  return DRUGS.filter((d) => [d.name, ...d.aliases].some((a) => a.includes(s) || s.includes(a))).slice(0, 4);
}

function labCandidates(said: string): { code: string; name: string }[] {
  const s = said.replace(/\s/g, "");
  if (!s) return [];
  const all = [
    ...ORDER_SETS.map((x) => ({ code: x.code, name: x.name, aliases: x.aliases })),
    ...LAB_TESTS.map((x) => ({ code: x.code, name: x.name, aliases: x.aliases })),
  ];
  return all.filter((x) => [x.name, ...x.aliases].some((a) => a.includes(s) || s.includes(a))).slice(0, 4);
}

const mainDrug = (d: InjectionDraft) => (d.items[0]?.drugCode ? findDrug(d.items[0].drugCode) : undefined);

export function effectiveRoute(d: InjectionDraft): InjectionRoute | null {
  if (d.route) return d.route;
  const m = mainDrug(d);
  return m && m.routes.length === 1 ? m.routes[0] : null;
}

function activeSameDrug(d: InjectionDraft, ctx: CheckContext): OrderEntry[] {
  const code = d.items[0]?.drugCode;
  if (!code) return [];
  // An order already being stopped by a draft (e.g. 修正 from the calendar) is not a duplicate.
  return ctx.activeOrders.filter(
    (o) => o.order.type === "injection" && o.order.items[0]?.drugCode === code && !ctx.drafts.some((x) => x.kind === "stop" && resolvedStopTarget(x, ctx) === o.id),
  );
}

/** Running orders of a drug: the main drug of an injection, or an oral prescription. */
function stopTargets(drugCode: string, ctx: CheckContext): OrderEntry[] {
  return ctx.activeOrders.filter(
    (o) => (o.order.type === "injection" && o.order.items[0]?.drugCode === drugCode) || (o.order.type === "prescription" && o.order.drugCode === drugCode),
  );
}

/** Running orders of a procedure. */
function procTargets(code: string, ctx: CheckContext): OrderEntry[] {
  return ctx.activeOrders.filter((o) => o.order.type === "procedure" && o.order.code === code);
}

function targetsOf(d: StopDraft, ctx: CheckContext): OrderEntry[] {
  if (d.procCode) return procTargets(d.procCode, ctx);
  return d.drugCode ? stopTargets(d.drugCode, ctx) : [];
}

export function resolvedStopTarget(d: StopDraft, ctx: CheckContext): string | null {
  if (d.targetOrderId) return d.targetOrderId;
  const t = targetsOf(d, ctx);
  return t.length === 1 ? t[0].id : null;
}

function checkInjection(d: InjectionDraft, ctx: CheckContext): Issue[] {
  const issues: Issue[] = [];
  if (d.items.length === 0) {
    issues.push({ key: "drug", level: "stop", title: "薬", message: "薬が読み取れませんでした。言い直してください。" });
    return issues;
  }
  // 抗がん薬 come only from the regimen panel, where the dose, premedication and order are worked out.
  const chemo = d.items.map((it) => (it.drugCode ? findDrug(it.drugCode) : undefined)).filter((m) => m?.chemo);
  if (chemo.length && !d.sourceText.startsWith("（レジメン ")) {
    issues.push({ key: "chemo", level: "stop", title: "抗がん薬", message: `${chemo.map((m) => m!.name).join("・")}は、右の「レジメン」の欄から出します（量の計算・前投薬・投与の順番を確かめるため。架空の病院の取り決め）。` });
  }

  d.items.forEach((it, i) => {
    const master = it.drugCode ? findDrug(it.drugCode) : undefined;
    if (!master) {
      issues.push({
        key: `drug-${i}`,
        level: "stop",
        title: "薬",
        message: `「${it.said}」は院内のマスターにありません。`,
        choices: drugCandidates(it.said).map((c) => ({
          label: `${c.name} ${c.package}`,
          apply: (x) => ({ ...(x as InjectionDraft), items: (x as InjectionDraft).items.map((y, j) => (j === i ? { ...y, drugCode: c.code } : y)) }),
        })),
      });
      return;
    }
    if (it.unit && !master.units.includes(it.unit)) {
      issues.push({
        key: `unit-${i}`,
        level: "stop",
        title: "単位",
        message: `${master.name}（${master.package}）に「${it.unit}」は使えません。使える単位：${master.units.join("・")}`,
      });
    }
    if (it.amount === null) {
      issues.push({
        key: `amount-${i}`,
        level: "ask",
        title: "量",
        message: `${master.name} の量が抜けています。`,
        choices: master.volumeMl
          ? [
              {
                label: `1袋（${master.volumeMl}mL）`,
                apply: (x) => ({
                  ...(x as InjectionDraft),
                  items: (x as InjectionDraft).items.map((y, j) => (j === i ? { ...y, amount: master.volumeMl!, unit: "mL" } : y)),
                }),
              },
            ]
          : undefined,
      });
    }
  });

  const main = mainDrug(d);
  const route = effectiveRoute(d);
  if (!route && main) {
    issues.push({
      key: "route",
      level: "ask",
      title: "経路",
      message: "投与経路が抜けています。",
      choices: main.routes.map((r) => ({ label: r, apply: (x) => ({ ...(x as InjectionDraft), route: r }) })),
    });
  } else if (route && main && !main.routes.includes(route)) {
    issues.push({ key: "route", level: "stop", title: "経路", message: `${main.name} は「${route}」では使えません（マスターの経路：${main.routes.join("・")}）。` });
  } else if (!d.route && route) {
    issues.push({ key: "route", level: "info", title: "経路", message: `${route}（この薬のマスター上の経路は1つだけです）` });
  }

  if (!d.schedule) {
    issues.push({
      key: "schedule",
      level: "ask",
      title: "回数",
      message: "回数（1日何回・何時間ごと）が抜けています。",
      choices:
        main?.kind === "輸液"
          ? [1, 2, 3].map((c) => ({ label: `1日${c}本`, apply: (x: Draft) => ({ ...(x as InjectionDraft), schedule: { kind: "per_day" as const, count: c } }) }))
          : undefined,
    });
  }

  // Infusion time / rate (drip only)
  if (route === "点滴静注" && d.schedule) {
    const n = dosesPerDay(d.schedule);
    const vol = doseVolumeMl(d.items);
    const fluidOnly = d.items.every((it) => (it.drugCode ? findDrug(it.drugCode)?.kind === "輸液" : false));

    if (d.infusionMinutes === null && d.rateMlPerH === null) {
      issues.push({
        key: "rate",
        level: "ask",
        title: fluidOnly ? "速度" : "点滴時間",
        message: fluidOnly ? "速度（何時間で・何mL/時）が抜けています。" : "1回の点滴時間が抜けています。",
      });
    } else if (d.infusionMinutes !== null && d.infusionScope === "unclear" && n > 1) {
      const perDose = d.infusionMinutes;
      const whole = d.infusionMinutes / n;
      const over = perDose * n > 1440;
      issues.push({
        key: "scope",
        level: "ask",
        title: "速度",
        message: `「${hoursText(d.infusionMinutes)}で」が1袋あたりか、1日分（${n}袋）か、どちらにも取れます。`,
        choices: [
          {
            label: `1袋を${hoursText(perDose)}で（${vol > 0 ? round1(vol / (perDose / 60)) : "—"}mL/時）`,
            note: over ? `${n}袋で${hoursText(perDose * n)}になり、24時間を超えます` : undefined,
            apply: (x) => ({ ...(x as InjectionDraft), infusionScope: "per_dose" }),
          },
          {
            label: `${n}袋を${hoursText(d.infusionMinutes)}で（${vol > 0 ? round1((vol * n) / (d.infusionMinutes / 60)) : "—"}mL/時）`,
            note: `1袋あたり${hoursText(Math.round(whole))}`,
            apply: (x) => ({ ...(x as InjectionDraft), infusionScope: "whole_day" }),
          },
        ],
      });
    } else {
      const plan = ratePlan(d);
      // Said rate vs said time
      if (d.rateMlPerH !== null && d.infusionMinutes !== null && d.prefer === null) {
        const timeOnly = ratePlan({ ...d, rateMlPerH: null });
        if (timeOnly.rateMlPerH !== null && Math.abs(timeOnly.rateMlPerH - d.rateMlPerH) / timeOnly.rateMlPerH > 0.1) {
          issues.push({
            key: "rate-mismatch",
            level: "ask",
            title: "計算",
            message: `時間から計算した速度（${timeOnly.rateMlPerH}mL/時）と、言われた速度（${d.rateMlPerH}mL/時）が合いません。`,
            formula: timeOnly.formula ?? undefined,
            choices: [
              { label: `時間に合わせる（${timeOnly.rateMlPerH}mL/時）`, apply: (x) => ({ ...(x as InjectionDraft), prefer: "time" }) },
              { label: `速度に合わせる（${d.rateMlPerH}mL/時）`, apply: (x) => ({ ...(x as InjectionDraft), prefer: "rate" }) },
            ],
          });
        }
      }
      if (plan.minutesPerDose !== null && plan.minutesPerDose * n > 1440 + 1) {
        issues.push({
          key: "over-24h",
          level: "stop",
          title: "計算",
          message: `1回${hoursText(Math.round(plan.minutesPerDose))} × 1日${round1(n)}回 = ${hoursText(Math.round(plan.minutesPerDose * n))}で、24時間を超えます。`,
        });
      } else if (plan.formula && !issues.some((i) => i.key === "rate-mismatch")) {
        issues.push({ key: "rate-calc", level: "info", title: "計算", message: "速度", formula: plan.formula });
      }
    }
  }

  // KCl: always mixed into a fluid and dripped. Concentration, rate and daily amount by code
  // (KCL_LIMITS, from the package insert).
  const kcl = d.items.filter((it) => it.drugCode === "INJ-KCL20" && it.amount !== null);
  if (kcl.length) {
    const meq = kcl.reduce((n, it) => n + (it.unit === "キット" ? it.amount! * 20 : it.amount!), 0); // 1 mEq/mL
    const fluidMl = doseVolumeMl(d.items.filter((it) => it.drugCode && findDrug(it.drugCode)?.kind === "輸液"));
    const src = KCL_LIMITS.source;
    if (fluidMl === 0 || route !== "点滴静注") {
      issues.push({ key: "kcl-mix", level: "stop", title: "KCl", message: `KCl はそのまま静注しません。輸液に混ぜて点滴します（${src}）。` });
    } else {
      const total = fluidMl + meq;
      const perL = round1((meq / total) * 1000);
      if (perL > KCL_LIMITS.maxMeqPerL)
        issues.push({ key: "kcl-conc", level: "stop", title: "KCl 濃度", message: `カリウムの濃度が ${KCL_LIMITS.maxMeqPerL} mEq/L を超えます（${src}）。`, formula: `${meq}mEq ÷ ${total}mL × 1000 = ${perL}mEq/L` });
      const plan = ratePlan(d);
      const perHour = plan.minutesPerDose ? round1(meq / (plan.minutesPerDose / 60)) : null;
      if (perHour !== null && perHour > KCL_LIMITS.maxMeqPerHour)
        issues.push({ key: "kcl-rate", level: "stop", title: "KCl 速度", message: `カリウムが1時間に ${KCL_LIMITS.maxMeqPerHour} mEq を超えて入ります（${src}）。`, formula: `${meq}mEq ÷ ${hoursText(plan.minutesPerDose!)} = ${perHour}mEq/時` });
      const perDay = d.schedule ? meq * dosesPerDay(d.schedule) : null;
      if (perDay !== null && perDay > KCL_LIMITS.maxMeqPerDay)
        issues.push({ key: "kcl-day", level: "stop", title: "KCl 1日量", message: `カリウムが1日 ${KCL_LIMITS.maxMeqPerDay} mEq を超えます（${src}）。`, formula: `${meq}mEq × ${round1(dosesPerDay(d.schedule!))}回 = ${perDay}mEq/日` });
      if (!issues.some((i) => i.key.startsWith("kcl-")))
        issues.push({
          key: "kcl-calc",
          level: "info",
          title: "KCl",
          message: `濃度・速度・1日量は添付文書の上限の中です（${KCL_LIMITS.maxMeqPerL}mEq/L・${KCL_LIMITS.maxMeqPerHour}mEq/時・${KCL_LIMITS.maxMeqPerDay}mEq/日）`,
          formula: `${meq}mEq ÷ ${total}mL × 1000 = ${perL}mEq/L${perHour !== null ? `、${perHour}mEq/時` : ""}${perDay !== null ? `、${perDay}mEq/日` : ""}`,
        });
    }
  }

  // Start
  const startDay = d.start.day ?? 0;
  if (startDay === 0 && d.start.time && minutesOf(d.start.time) < minutesOf(ctx.nowTime)) {
    issues.push({
      key: "start-past",
      level: "ask",
      title: "日時",
      message: `開始時刻（今日 ${d.start.time}）はもう過ぎています。`,
      choices: [
        { label: "指示受け後すぐに開始", apply: (x) => ({ ...(x as InjectionDraft), start: { day: 0, time: null } }) },
        { label: `明日の ${d.start.time} から`, apply: (x) => ({ ...(x as InjectionDraft), start: { day: 1, time: (x as InjectionDraft).start.time } }) },
      ],
    });
  } else {
    issues.push({
      key: "start",
      level: "info",
      title: "開始",
      message: `${ctx.fmtDay(startDay)} ${d.start.time ?? "指示受け後すぐ"}${d.start.day === null ? "（日付の指定なし → 今日）" : ""}`,
    });
  }

  // Duplicates against orders in effect
  const same = activeSameDrug(d, ctx).filter(
    (o) => !ctx.drafts.some((x) => x.kind === "stop" && x.id !== d.id && resolvedStopTarget(x, ctx) === o.id),
  );
  if (same.length > 0 && !d.duplicate) {
    const o = same[0];
    issues.push({
      key: "duplicate",
      level: "ask",
      title: "重複",
      message: `同じ薬の有効なオーダがあります：${ctx.describe(o)}`,
      choices: [
        { label: "前のオーダを止めて、これに置き換える", apply: (x) => ({ ...(x as InjectionDraft), duplicate: { action: "replace", orderId: o.id } }) },
        { label: "前のオーダはそのまま、追加で出す", apply: (x) => ({ ...(x as InjectionDraft), duplicate: { action: "add", orderId: o.id } }) },
      ],
    });
  } else if (d.duplicate) {
    issues.push({
      key: "duplicate",
      level: "info",
      title: "重複",
      message: d.duplicate.action === "replace" ? "確定すると、前のオーダは中止になります。" : "前のオーダと重ねて出します。",
    });
  }

  return issues;
}

function expandAnalytes(code: string): string[] {
  const set = findSet(code);
  if (set) return set.labCodes.flatMap(expandAnalytes);
  const t = findLab(code);
  return t?.contains ?? [code];
}

/** Where a timed level draw lands: N-th dose of a drug drafted now (or already running). */
export function beforeDoseTime(d: LabDraft, ctx: CheckContext): { day: DayOffset; time: string; doseLabel: string } | null {
  const bd = d.collect.beforeDose;
  if (!bd?.n || !bd.drugCode) return null;
  const inj = ctx.drafts.find((x): x is InjectionDraft => x.kind === "injection" && x.items[0]?.drugCode === bd.drugCode);
  let start: { day: number; time: string } | null = null;
  let hours: number | null = null;
  if (inj?.schedule?.kind === "every_hours" && inj.start.time) {
    start = { day: inj.start.day ?? 0, time: inj.start.time };
    hours = inj.schedule.hours;
  } else {
    const o = ctx.activeOrders.find(
      (x) => x.order.type === "injection" && x.order.items[0]?.drugCode === bd.drugCode && x.order.schedule.kind === "every_hours",
    );
    if (o && o.order.type === "injection" && o.order.schedule.kind === "every_hours" && o.order.start.time) {
      start = { day: o.order.start.day, time: o.order.start.time };
      hours = o.order.schedule.hours;
    }
  }
  if (!start || !hours) return null;
  const doseMin = start.day * 1440 + minutesOf(start.time) + (bd.n - 1) * hours * 60;
  const drawMin = doseMin - WARD_RULES.minutesBeforeDoseForLevel;
  const day = Math.floor(drawMin / 1440);
  const m = drawMin - day * 1440;
  const hhmm = (x: number) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
  const doseDay = Math.floor(doseMin / 1440);
  return { day, time: hhmm(m), doseLabel: `${bd.n}回目の投与（${ctx.fmtDay(doseDay)} ${hhmm(doseMin - doseDay * 1440)}）` };
}

/** Resolved collection day/time/priority, or null when something is missing. */
export function resolvedCollect(d: LabDraft, ctx: CheckContext): { day: DayOffset; time: string; priority: LabPriority; why: string } | null {
  const c = d.collect;
  if (c.when === "before_dose") {
    const t = beforeDoseTime(d, ctx);
    if (!t) return null;
    return { day: t.day, time: t.time, priority: d.priority ?? "定時", why: `${t.doseLabel}の${WARD_RULES.minutesBeforeDoseForLevel}分前` };
  }
  if (c.when === "now") {
    const [h, m] = ctx.nowTime.split(":").map(Number);
    const up = Math.ceil((h * 60 + m) / 5) * 5;
    const time = `${String(Math.floor(up / 60) % 24).padStart(2, "0")}:${String(up % 60).padStart(2, "0")}`;
    return { day: 0, time, priority: d.priority ?? "至急", why: "「今すぐ」は至急として扱います" };
  }
  if (c.when === "morning_routine") {
    const day = c.day ?? (minutesOf(ctx.nowTime) < minutesOf(WARD_RULES.routineDrawTime) ? 0 : 1);
    return { day, time: WARD_RULES.routineDrawTime, priority: d.priority ?? "定時", why: `「朝」は定時採血（${WARD_RULES.routineDrawTime}）` };
  }
  if (c.when === "specific_time" && c.time) {
    return { day: c.day ?? 0, time: c.time, priority: d.priority ?? "定時", why: "" };
  }
  return null;
}

function checkLab(d: LabDraft, ctx: CheckContext): Issue[] {
  const issues: Issue[] = [];
  if (d.tests.length === 0) {
    issues.push({ key: "tests", level: "stop", title: "検査", message: "検査の項目が読み取れませんでした。言い直してください。" });
    return issues;
  }
  d.tests.forEach((t, i) => {
    if (!t.code) {
      issues.push({
        key: `test-${i}`,
        level: "stop",
        title: "検査",
        message: `「${t.said}」は院内のマスターにありません。`,
        choices: labCandidates(t.said).map((c) => ({
          label: c.name,
          apply: (x) => ({ ...(x as LabDraft), tests: (x as LabDraft).tests.map((y, j) => (j === i ? { ...y, code: c.code } : y)) }),
        })),
      });
      return;
    }
    const set = findSet(t.code);
    if (set) {
      issues.push({ key: `set-${i}`, level: "info", title: "セット", message: `${set.name}：${set.labCodes.map((c) => findLab(c)?.name ?? c).join("、")}` });
    }
    if (findLab(t.code)?.needs === "sets" && d.cultureSets === null) {
      issues.push({
        key: `sets-${i}`,
        level: "ask",
        title: "セット数",
        message: `${findLab(t.code)!.name} のセット数が抜けています。`,
        choices: [2, 1].map((n) => ({ label: `${n}セット`, apply: (x: Draft) => ({ ...(x as LabDraft), cultureSets: n }) })),
      });
    }
  });

  const c = d.collect;
  if (c.when === "before_dose" && !beforeDoseTime(d, ctx)) {
    issues.push({
      key: "collect",
      level: "ask",
      title: "日時",
      message: !c.beforeDose?.n
        ? "何回目の投与の前に採るかが抜けています。"
        : "基準になる投与（開始時刻と間隔）が見つかりません。同じ指示の中で薬の開始時刻と間隔を言ってください。",
    });
  } else if (c.when === "specific_time" && !c.time) {
    issues.push({ key: "collect", level: "ask", title: "日時", message: "採取の時刻が抜けています。" });
  } else if (!c.when) {
    issues.push({
      key: "collect",
      level: "ask",
      title: "日時",
      message: "採取の日時が抜けています。",
      choices: [
        { label: "今すぐ（至急）", apply: (x) => ({ ...(x as LabDraft), collect: { ...(x as LabDraft).collect, day: 0, when: "now" } }) },
        {
          label: `明日朝の定時（${WARD_RULES.routineDrawTime}）`,
          apply: (x) => ({ ...(x as LabDraft), collect: { ...(x as LabDraft).collect, day: 1, when: "morning_routine" } }),
        },
      ],
    });
  }

  const r = resolvedCollect(d, ctx);
  if (r) {
    if (r.day < 0 || (r.day === 0 && d.collect.when !== "now" && minutesOf(r.time) < minutesOf(ctx.nowTime))) {
      issues.push({ key: "collect-past", level: "stop", title: "日時", message: `採取日時（${ctx.fmtDay(r.day)} ${r.time}）はもう過ぎています。` });
    } else {
      issues.push({
        key: "collect",
        level: "info",
        title: "採取",
        message: `${ctx.fmtDay(r.day)} ${r.time}　${r.priority}${r.why ? `（${r.why}）` : ""}`,
      });
    }

    // Same analytes already ordered for the same day
    if (!d.duplicateOk) {
      const mine = new Set(d.tests.flatMap((t) => (t.code ? expandAnalytes(t.code) : [])));
      const dup = ctx.labOrders.find(
        (o) => o.order.type === "lab" && o.order.collect.day === r.day && o.order.codes.flatMap(expandAnalytes).some((a) => mine.has(a)),
      );
      if (dup) {
        issues.push({
          key: "duplicate",
          level: "ask",
          title: "重複",
          message: `同じ日に同じ項目を含むオーダがあります：${ctx.describe(dup)}`,
          choices: [
            { label: "重ねて出す", apply: (x) => ({ ...(x as LabDraft), duplicateOk: true }) },
            { label: "この下書きを消す", remove: true },
          ],
        });
      }
    }
  }
  return issues;
}

function checkStop(d: StopDraft, ctx: CheckContext): Issue[] {
  if (d.procCode !== undefined && d.procCode !== null) {
    const name = findProc(d.procCode)!.name;
    const targets = targetsOf(d, ctx);
    if (targets.length === 0) return [{ key: "target", level: "stop", title: "中止", message: `${name} の有効なオーダが見つかりません。` }];
    const resolved = resolvedStopTarget(d, ctx);
    if (!resolved) {
      return [
        {
          key: "target",
          level: "ask",
          title: "中止",
          message: `${name} の有効なオーダが複数あります。どれを止めますか。`,
          choices: targets.map((t) => ({ label: ctx.describe(t), apply: (x) => ({ ...(x as StopDraft), targetOrderId: t.id }) })),
        },
      ];
    }
    const t = ctx.activeOrders.find((o) => o.id === resolved)!;
    return [{ key: "target", level: "info", title: "中止", message: `確定すると中止になります：${ctx.describe(t)}` }];
  }
  if (d.procCode === null) {
    return [
      {
        key: "proc",
        level: "stop",
        title: "中止",
        message: `中止する処置「${d.said}」が院内の処置マスターにありません。`,
        choices: procCandidates(d.said).map((c) => ({ label: c.name, apply: (x) => ({ ...(x as StopDraft), procCode: c.code }) })),
      },
    ];
  }
  if (!d.drugCode) {
    return [
      {
        key: "drug",
        level: "stop",
        title: "中止",
        message: `中止する薬「${d.said}」がマスターにありません。`,
        choices: drugCandidates(d.said).map((c) => ({ label: `${c.name} ${c.package}`, apply: (x) => ({ ...(x as StopDraft), drugCode: c.code }) })),
      },
    ];
  }
  const targets = stopTargets(d.drugCode, ctx);
  if (targets.length === 0) {
    return [{ key: "target", level: "stop", title: "中止", message: `${anyDrugName(d.drugCode)} の有効なオーダが見つかりません。` }];
  }
  const resolved = resolvedStopTarget(d, ctx);
  if (!resolved) {
    return [
      {
        key: "target",
        level: "ask",
        title: "中止",
        message: "同じ薬の有効なオーダが複数あります。どれを止めますか。",
        choices: targets.map((t) => ({ label: ctx.describe(t), apply: (x) => ({ ...(x as StopDraft), targetOrderId: t.id }) })),
      },
    ];
  }
  const t = ctx.activeOrders.find((o) => o.id === resolved)!;
  return [{ key: "target", level: "info", title: "中止", message: `確定すると中止になります：${ctx.describe(t)}` }];
}

// ---------------------------------------------------------------------------
// Procedures (処置)
// ---------------------------------------------------------------------------

function procCandidates(said: string): ProcMaster[] {
  const s = said.replace(/\s/g, "");
  if (!s) return [];
  return PROCEDURES.filter((p) => [p.name, ...p.aliases].some((a) => a.includes(s) || s.includes(a))).slice(0, 4);
}

const fmtNum = (n: number) => n.toLocaleString("ja-JP");

/** The area class of a wound: chosen, or computed from the area / lengths said. */
export function procArea(d: ProcedureDraft): { area: AreaClass | null; formula: string | null } {
  if (d.area) return { area: d.area, formula: null };
  const { lengthCm: l, widthCm: w, areaCm2 } = d.size;
  if (areaCm2 !== null) return { area: areaClassOf(areaCm2), formula: `${fmtNum(areaCm2)}cm²` };
  if (l !== null && w !== null) return { area: areaClassOf(l * w), formula: `${l}cm × ${w}cm = ${fmtNum(Math.round(l * w * 10) / 10)}cm²` };
  return { area: null, formula: null };
}

/** The schedule in effect: 酸素 and 留置 always run until stopped. */
export function procSchedule(d: ProcedureDraft): ProcSchedule | null {
  const m = d.code ? findProc(d.code) : undefined;
  if (m?.continuous) return { kind: "continuous" };
  return d.schedule;
}

/** Amount choices for a procedure drug, by its unit. Offered for the doctor to pick; nothing is preselected. */
const DRUG_AMOUNTS: Record<string, number[]> = { g: [5, 10, 20], 個: [1, 2] };

/** Flows offered when the flow is missing: the device's usual range on this ward. */
function flowChoices(device: O2Device): number[] {
  const { min, max } = O2_DEVICES[device];
  const all = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15];
  return all.filter((x) => x >= min && x <= max);
}

function checkProcedure(d: ProcedureDraft, ctx: CheckContext): Issue[] {
  const issues: Issue[] = [];
  const m = d.code ? findProc(d.code) : undefined;
  if (!m) {
    issues.push({
      key: "proc",
      level: "stop",
      title: "処置",
      message: `「${d.said}」は院内の処置マスターにありません。`,
      choices: procCandidates(d.said).map((c) => ({ label: c.name, apply: (x) => ({ ...(x as ProcedureDraft), code: c.code }) })),
    });
    return issues;
  }
  const set = (patch: Partial<ProcedureDraft>) => (x: Draft) => ({ ...(x as ProcedureDraft), ...patch });

  // 酸素: device and flow
  if (m.needs.includes("o2")) {
    const running = procTargets(m.code, ctx).find((o) => o.order.type === "procedure" && o.order.o2);
    const runningDevice = running && running.order.type === "procedure" ? running.order.o2?.device : undefined;
    if (!d.o2.device) {
      const names = runningDevice ? [runningDevice, ...O2_DEVICE_NAMES.filter((n) => n !== runningDevice)] : O2_DEVICE_NAMES;
      issues.push({
        key: "o2-device",
        level: "ask",
        title: "器具",
        message: "酸素の器具が抜けています。",
        choices: names.map((n) => ({
          label: n === runningDevice ? `${n}（今の酸素と同じ）` : n,
          apply: (x) => ({ ...(x as ProcedureDraft), o2: { ...(x as ProcedureDraft).o2, device: n } }),
        })),
      });
    }
    if (d.o2.lpm === null) {
      issues.push({
        key: "o2-flow",
        level: "ask",
        title: "流量",
        message: "酸素の流量（L/分）が抜けています。",
        choices: d.o2.device
          ? flowChoices(d.o2.device).map((f) => ({ label: `${f}L/分`, apply: (x) => ({ ...(x as ProcedureDraft), o2: { ...(x as ProcedureDraft).o2, lpm: f } }) }))
          : undefined,
      });
    } else if (d.o2.device) {
      const r = O2_DEVICES[d.o2.device];
      if ((d.o2.lpm < r.min || d.o2.lpm > r.max) && !d.flowOk) {
        issues.push({
          key: "o2-range",
          level: "ask",
          title: "流量",
          message: `${d.o2.device}で${d.o2.lpm}L/分です。この病棟の取り決め（架空）では、${d.o2.device}は${r.min}〜${r.max}L/分で使います。`,
          choices: [{ label: `${d.o2.lpm}L/分で出す`, apply: set({ flowOk: true }) }],
        });
      }
      if (d.o2.lpm > 0) {
        issues.push({
          key: "o2-volume",
          level: "info",
          title: "計算",
          message: "1日続けた場合の酸素量",
          formula: `${d.o2.lpm}L/分 × 1,440分 = ${fmtNum(d.o2.lpm * 1440)}L`,
        });
      }
    }
  }

  // 透析の条件: chosen by the doctor in the 透析 panel; the ultrafiltration rate is worked out here.
  if (m.needs.includes("hd")) {
    if (!d.hd) {
      issues.push({ key: "hd", level: "stop", title: "透析", message: "透析の条件（時間・血流量・抗凝固薬・除水量など）は、右の「透析」の欄で入れてください。" });
    } else {
      const h = d.hd;
      issues.push({ key: "hd", level: "info", title: "条件", message: `${h.method}（${h.purpose}）　${hdText(h)}` });
      const w = ctx.patientFacts?.weightKg;
      if (h.uf > 0 && w) {
        const r = hdUfRate(h.uf, h.minutes, w);
        const over = r.rate > HD_UF_RATE.max;
        if (over && !d.hdOk)
          issues.push({
            key: "hd-uf",
            level: "ask",
            title: "除水速度",
            message: `除水速度が ${r.rate}mL/kg/時 で、目安の ${HD_UF_RATE.max}mL/kg/時 を超えます（${HD_UF_RATE.source}。体重はカルテの値）。`,
            formula: r.formula,
            choices: [{ label: `${r.rate}mL/kg/時のまま出す`, apply: set({ hdOk: true }) }],
          });
        else
          issues.push({
            key: "hd-uf",
            level: "info",
            title: "除水速度",
            message: over ? `目安（${HD_UF_RATE.max}mL/kg/時）を超えることを承知で出します。` : `目安は ${HD_UF_RATE.max}mL/kg/時 以下（${HD_UF_RATE.source}）。`,
            formula: r.formula,
          });
      } else if (h.uf > 0) {
        issues.push({ key: "hd-uf", level: "info", title: "除水速度", message: "体重がカルテにないため、除水速度を計算できません。" });
      }
      if (h.dw !== null && w) issues.push({ key: "hd-dw", level: "info", title: "DW", message: "カルテの体重と DW の差（参考）", formula: `${w}kg − DW ${h.dw}kg = ${Math.round((w - h.dw) * 10) / 10}kg` });
    }
  }

  // リハビリ処方 and 他科依頼: entered in their panels.
  if (m.needs.includes("rehab")) {
    if (!d.rehab) issues.push({ key: "rehab", level: "stop", title: "リハビリ", message: "疾患別の区分・職種・起算日・目標は、右の「リハビリ」の欄で入れてください。" });
    else issues.push({ key: "rehab", level: "info", title: "リハビリ", message: `${d.rehab.field}　${d.rehab.therapists.join("・")}　起算日 ${ctx.fmtDay(d.rehab.onset)}（今日で${1 - d.rehab.onset}日目）。算定できる日数の上限は区分ごとに点数表で決まっています。` });
  }
  if (m.needs.includes("consult")) {
    if (!d.consult) issues.push({ key: "consult", level: "stop", title: "他科依頼", message: "依頼先と聞きたいことは、右の「他科依頼」の欄で入れてください。" });
    else issues.push({ key: "consult", level: "info", title: "他科依頼", message: `${d.consult.dept}（${d.consult.urgency}）。確定すると依頼先に届き、返書は「他科依頼」の欄に記録されます。` });
  }

  // 退院・外泊・外出 and 指導の依頼.
  if (m.needs.includes("leave")) {
    const l = d.leave;
    if (!l) issues.push({ key: "leave", level: "stop", title: "退院・外泊", message: "日時と行き先は、右の「退院・外泊」の欄で入れてください。" });
    else if (l.kind !== "退院" && !l.back) issues.push({ key: "leave", level: "stop", title: l.kind, message: `${l.kind}は戻る日時が要ります。` });
    else if (l.back && l.back.day * 1440 + minutesOf(l.back.time) <= l.from.day * 1440 + minutesOf(l.from.time)) issues.push({ key: "leave", level: "stop", title: l.kind, message: "戻る日時が出る日時より前です。" });
    else issues.push({ key: "leave", level: "info", title: l.kind, message: `${l.kind === "退院" ? "確定すると病棟の退院予定に入ります。退院処方・サマリ・紹介状が要るかは別に確かめてください。" : "確定すると病棟の予定に入ります。"}` });
  }
  if (m.needs.includes("move")) {
    if (!d.move) issues.push({ key: "move", level: "stop", title: "移動", message: "移動先は、左の「移動・食事」のカレンダーで日付を押して選んでください。" });
    else issues.push({ key: "move", level: "info", title: d.move.kind, message: `${ctx.fmtDay(d.start.day ?? 0)} ${d.start.time ?? ""} に予約します。当日、病棟で「実施」を押すと移ります（4床室の性別などは、そのときもう一度確かめます）。` });
  }
  if (m.needs.includes("guide")) {
    if (!d.guide) issues.push({ key: "guide", level: "stop", title: "指導の依頼", message: "指導の種類は、右の「指導の依頼」の欄で選んでください。" });
    else issues.push({ key: "guide", level: "info", title: "指導の依頼", message: `確定すると${GUIDE_TO[d.guide.kind]}のやることに入ります。` });
  }

  // 輸血: the blood type (2 samples), the antibody screen for red cells, the expected effect and the pace.
  if (m.needs.includes("tx")) {
    if (!d.tx) {
      issues.push({ key: "tx", level: "stop", title: "輸血", message: "製剤と量は、右の「輸血」の欄で入れてください。" });
    } else {
      const t = d.tx;
      const b = ctx.txFacts?.blood;
      issues.push({ key: "tx", level: "info", title: "製剤", message: txText(t) });
      if (!b) issues.push({ key: "tx-abo", level: "stop", title: "血液型", message: `血液型が検査されていません。血液型は、別の時点に採った2つの検体で確かめます（${TX_DO.label}）。` });
      else if (b.checks < 2) issues.push({ key: "tx-abo", level: "stop", title: "血液型", message: `血液型（${b.abo}型 Rh${b.rh}）の確認が${b.checks}回です。別の時点に採った検体で2回目を確かめてから出します（${TX_DO.label}）。` });
      else if (b.abo !== t.abo || b.rh !== t.rh) issues.push({ key: "tx-abo", level: "stop", title: "血液型", message: `カルテの血液型（${b.abo}型 Rh${b.rh}）と製剤の型が違います。` });
      if (t.product === "RBC") {
        if (!b?.antibody) issues.push({ key: "tx-ab", level: "stop", title: "不規則抗体", message: `赤血球の輸血の前に、不規則抗体のスクリーニングが要ります（${TX_DO.label}）。` });
        else if (b.antibody === "陽性") issues.push({ key: "tx-ab", level: "ask", title: "不規則抗体", message: "不規則抗体が陽性です。抗原のない血液を用意するのに時間がかかることがあります。検査室と相談してください。", choices: [{ label: "検査室と相談した", apply: (x) => ({ ...(x as ProcedureDraft), comment: [(x as ProcedureDraft).comment, "不規則抗体陽性：検査室と相談済み"].filter(Boolean).join("　") }) }] });
        issues.push({ key: "tx-cross", level: "info", title: "交差適合試験", message: "確定すると、検査室が交差適合試験をします（この試作では結果の入力はありません）。" });
      }
      const lab = TX_PRODUCTS[t.product].lab;
      const last = ctx.txFacts?.latest[lab];
      const guide = t.product === "RBC" ? "慢性貧血では Hb 7g/dL が目安の一つ（病態で判断する）" : t.product === "PC" ? "予防の輸血は 1〜2万/µL が目安の一つ" : "PT-INR 2.0 以上（または活性 30%以下）が目安の一つ";
      issues.push({ key: "tx-lab", level: "info", title: "検査値", message: `${TX_PRODUCTS[t.product].labLabel} ${last ? `${last.value}（${ctx.fmtDay(last.day)}）` : "の値がカルテにありません"}。${guide}（${TX_USE.label}、参考）。` });
      const w = ctx.patientFacts?.weightKg;
      if (w) {
        const e = txEffect(t, w);
        issues.push({ key: "tx-effect", level: "info", title: "予測", message: `${e.text}（${TX_USE.label}の式。体重はカルテの値）`, formula: e.formula });
      }
      const ml = txVolume(t);
      const run = txMinutes(ml);
      issues.push({ key: "tx-rate", level: "info", title: "速さ", message: `最初の10〜15分は1mL/分ほど、その後は5mL/分ほど（${TX_DO.label}）。約${ml}mL で約${run.minutes}分。開始後5分間と15分後に、そばで様子を見ます。`, formula: run.formula });
    }
  }

  // 部位
  if (m.needs.includes("site") && !d.site) {
    issues.push({
      key: "site",
      level: "ask",
      title: "部位",
      message: "部位が抜けています。",
      choices: m.sites?.map((s) => ({ label: s, apply: set({ site: s }) })),
    });
  }

  // 範囲
  if (m.needs.includes("area")) {
    const a = procArea(d);
    if (!a.area) {
      issues.push({
        key: "area",
        level: "ask",
        title: "範囲",
        message: d.sizeSaid
          ? `「${d.sizeSaid}」を大きさに直せませんでした。縦×横を言うか、区分を選んでください。`
          : "範囲（大きさ）が抜けています。縦×横を言うか、区分を選んでください。",
        choices: AREA_CLASSES.map((c) => ({ label: AREA_LABEL[c], apply: set({ area: c }) })),
      });
    } else {
      issues.push({ key: "area", level: "info", title: "範囲", message: AREA_LABEL[a.area], formula: a.formula ?? undefined });
      if (a.area === "lt100") {
        issues.push({
          key: "area-lt100",
          level: "info",
          title: "算定",
          message: "100cm²未満は、入院中は手術後の患者（手術日から14日まで）だけ算定できる区分です（J000 注1・J001-4 注2）。処置は出せます。",
        });
      }
    }
  }

  // 深さ（褥瘡）
  if (m.needs.includes("depth")) {
    if (!d.depth) {
      issues.push({
        key: "depth",
        level: "ask",
        title: "深さ",
        message: "褥瘡の深さ（DESIGN-R®2020）が抜けています。",
        choices: DEPTHS.map((x) => ({ label: DEPTH_LABEL[x], apply: set({ depth: x }) })),
      });
    } else {
      issues.push({
        key: "depth",
        level: "info",
        title: "深さ",
        message: `${DEPTH_LABEL[d.depth]}（算定は${isSevereUlcer(d.depth) ? "重度褥瘡処置 J001-4" : "創傷処置 J000"}の区分）`,
      });
    }
  }

  // 回数
  const schedule = procSchedule(d);
  if (!schedule) {
    issues.push({
      key: "schedule",
      level: "ask",
      title: "回数",
      message: "回数（1日何回・隔日・必要時）が抜けています。",
      choices: m.schedules.map((s) => ({ label: procScheduleText(s), apply: set({ schedule: s }) })),
    });
  } else if (m.continuous) {
    issues.push({ key: "schedule", level: "info", title: "回数", message: "中止するまで続きます。" });
  }

  // 薬剤
  if (m.uses) {
    const u = findProcDrug(m.uses.code)!;
    issues.push({ key: "uses", level: "info", title: "薬剤", message: `${u.name} を1回に${m.uses.amount}${u.unit}使います。` });
  }
  if (d.drug) {
    const pd = d.drug.code ? findProcDrug(d.drug.code) : undefined;
    if (!pd) {
      const s = d.drug.said.replace(/\s/g, "");
      issues.push({
        key: "drug",
        level: "stop",
        title: "薬剤",
        message: `「${d.drug.said}」は院内の処置薬のマスターにありません。`,
        choices: PROC_DRUGS.filter((x) => !s || [x.name, ...x.aliases].some((a) => a.includes(s) || s.includes(a)))
          .slice(0, 4)
          .map((x) => ({ label: x.name, apply: (y) => ({ ...(y as ProcedureDraft), drug: { ...(y as ProcedureDraft).drug!, code: x.code } }) })),
      });
    } else if (m.drugs && !m.drugs.includes(pd.code)) {
      issues.push({ key: "drug", level: "stop", title: "薬剤", message: `${pd.name} は ${m.name} で使う薬に入っていません。` });
    } else if (d.drug.amount === null) {
      issues.push({
        key: "drug-amount",
        level: "ask",
        title: "量",
        message: `${pd.name} の1回の量が抜けています。`,
        choices: (DRUG_AMOUNTS[pd.unit] ?? []).map((n) => ({
          label: `${n}${pd.unit}`,
          apply: (y) => ({ ...(y as ProcedureDraft), drug: { ...(y as ProcedureDraft).drug!, amount: n } }),
        })),
      });
    }
  }

  // 開始
  const startDay = d.start.day ?? 0;
  if (startDay === 0 && d.start.time && minutesOf(d.start.time) < minutesOf(ctx.nowTime)) {
    issues.push({
      key: "start-past",
      level: "ask",
      title: "日時",
      message: `開始時刻（今日 ${d.start.time}）はもう過ぎています。`,
      choices: [
        { label: "指示受け後すぐに開始", apply: set({ start: { day: 0, time: null } }) },
        { label: `明日の ${d.start.time} から`, apply: (x) => ({ ...(x as ProcedureDraft), start: { day: 1, time: (x as ProcedureDraft).start.time } }) },
      ],
    });
  } else {
    issues.push({
      key: "start",
      level: "info",
      title: "開始",
      message: `${ctx.fmtDay(startDay)} ${d.start.time ?? "指示受け後すぐ"}${d.start.day === null ? "（日付の指定なし → 今日）" : ""}`,
    });
  }

  // 重複: the same procedure (on the same site) already running
  const same = procTargets(m.code, ctx).filter(
    (o) =>
      o.order.type === "procedure" &&
      (!m.needs.includes("site") || !d.site || !o.order.site || o.order.site === d.site) &&
      !ctx.drafts.some((x) => x.kind === "stop" && x.id !== d.id && resolvedStopTarget(x, ctx) === o.id),
  );
  if (same.length > 0 && !d.duplicate) {
    const o = same[0];
    issues.push({
      key: "duplicate",
      level: "ask",
      title: "重複",
      message: `同じ処置の有効なオーダがあります：${ctx.describe(o)}`,
      choices: [
        { label: "前のオーダを止めて、これに置き換える", apply: set({ duplicate: { action: "replace", orderId: o.id } }) },
        { label: "前のオーダはそのまま、追加で出す", apply: set({ duplicate: { action: "add", orderId: o.id } }) },
      ],
    });
  } else if (d.duplicate) {
    issues.push({
      key: "duplicate",
      level: "info",
      title: "重複",
      message: d.duplicate.action === "replace" ? "確定すると、前のオーダは中止になります。" : "前のオーダと重ねて出します。",
    });
  }
  const ci = consentIssue(consentFor({ type: "procedure", code: m.code }), ctx, !!d.consentPlanned, (x) => ({ ...(x as ProcedureDraft), consentPlanned: true }));
  if (ci) issues.push(ci);
  return issues;
}

/** 妊娠中 marked on the chart: said on every drug draft (the package insert decides; the app has no list). */
const pregnancyNote = (ctx: CheckContext): Issue[] =>
  ctx.patientFacts?.pregnancy ? [{ key: "pregnancy", level: "info", title: "妊娠中", message: `カルテに妊娠中${ctx.patientFacts.pregnancy.weeks ? `（${ctx.patientFacts.pregnancy.weeks}週）` : ""}の印があります。妊婦への投与は添付文書の記載を確かめてください。` }] : [];

export function checkDraft(d: Draft, ctx: CheckContext): Issue[] {
  switch (d.kind) {
    case "injection":
      return [...checkInjection(d, ctx), ...pregnancyNote(ctx)];
    case "lab":
      return checkLab(d, ctx);
    case "procedure":
      return checkProcedure(d, ctx);
    case "prescription":
      return [...checkPrescription(d, ctx, ctx.allergies ?? []), ...pregnancyNote(ctx)];
    case "imaging":
      return checkImaging(d, ctx, ctx.patientFacts ?? null);
    case "physio":
      return checkPhysio(d, ctx, ctx.patientFacts ?? null);
    case "stop":
      return checkStop(d, ctx);
    case "extend":
      return checkExtend(d, ctx);
    case "unclear":
      return [{ key: "unclear", level: "ask", title: "聞き取れず", message: d.reason }];
  }
}

export const isReady = (issues: Issue[]) => issues.every((i) => i.level === "info");

// ---------------------------------------------------------------------------
// Confirm: drafts → orders
// ---------------------------------------------------------------------------

export type ConfirmResult = {
  order?: Order;
  orders?: Order[];
  stopIds: string[];
  /** Consent forms to prepare for the new order. */
  consents?: ConsentCode[];
  /** 延長: the order's new 日数. */
  extend?: { orderId: string; days: number };
};

/** The last day of an order that has 日数 (offset from today), or null when it runs until changed. */
export function orderEndDay(o: Order): DayOffset | null {
  const start = "start" in o && o.start && typeof o.start === "object" && "day" in o.start ? (o.start.day as DayOffset) : null;
  const days = "days" in o ? (o.days as number | undefined) : undefined;
  return start === null || !days ? null : start + days - 1;
}

function checkExtend(d: ExtendDraft, ctx: CheckContext): Issue[] {
  const target = ctx.activeOrders.find((o) => o.id === d.targetOrderId);
  if (!target) return [{ key: "extend-target", level: "stop", title: "延長", message: "延長するオーダが、もう有効ではありません。" }];
  const end = orderEndDay(target.order);
  if (end === null) return [{ key: "extend-open", level: "stop", title: "延長", message: "日数の決まっていないオーダは、延長しなくても続きます。" }];
  if (ctx.drafts.some((x) => x.kind === "stop" && resolvedStopTarget(x, ctx) === target.id))
    return [{ key: "extend-stop", level: "stop", title: "延長", message: "同じオーダの中止の下書きがあります。どちらかを消してください。" }];
  const days = (target.order as { days: number }).days;
  return [
    {
      key: "extend-calc",
      level: "info",
      title: "延長",
      message: `${ctx.describe(target)}`,
      formula: `${days}日間（〜${ctx.fmtDay(end)}） → ${days + d.addDays}日間（〜${ctx.fmtDay(end + d.addDays)}）`,
    },
  ];
}

/** Only call when isReady(checkDraft(d, ctx)). */
export function toOrder(d: Draft, ctx: CheckContext): ConfirmResult {
  if (d.kind === "stop") {
    const id = resolvedStopTarget(d, ctx);
    return { stopIds: id ? [id] : [] };
  }
  if (d.kind === "unclear") return { stopIds: [] };
  if (d.kind === "extend") {
    const target = ctx.activeOrders.find((o) => o.id === d.targetOrderId)!;
    return { stopIds: [], extend: { orderId: target.id, days: (target.order as { days: number }).days + d.addDays } };
  }
  if (d.kind === "prescription") return { orders: toPrescriptionOrders(d, ctx.nowTime, d.id), stopIds: [] };
  if (d.kind === "imaging") {
    const order = toImagingOrder(d);
    const need = consentFor(order);
    return { order, stopIds: [], consents: need && d.consentPlanned ? [need] : [] };
  }
  if (d.kind === "physio") return { order: toPhysioOrder(d), stopIds: [] };
  if (d.kind === "procedure") {
    const m = findProc(d.code!)!;
    const a = procArea(d);
    const size = a.formula && (d.size.lengthCm !== null || d.size.areaCm2 !== null) ? a.formula.split(" = ")[0] : null;
    const order: ProcedureOrder = {
      type: "procedure",
      code: m.code,
      site: d.site ?? undefined,
      area: m.needs.includes("area") ? a.area! : undefined,
      depth: m.needs.includes("depth") ? d.depth! : undefined,
      o2: m.needs.includes("o2") ? { device: d.o2.device!, lpm: d.o2.lpm! } : undefined,
      hd: m.needs.includes("hd") && d.hd ? d.hd : undefined,
      tx: m.needs.includes("tx") && d.tx ? d.tx : undefined,
      rehab: m.needs.includes("rehab") && d.rehab ? d.rehab : undefined,
      consult: m.needs.includes("consult") && d.consult ? d.consult : undefined,
      leave: m.needs.includes("leave") && d.leave ? d.leave : undefined,
      guide: m.needs.includes("guide") && d.guide ? d.guide : undefined,
      move: m.needs.includes("move") && d.move ? d.move : undefined,
      schedule: procSchedule(d)!,
      start: { day: d.start.day ?? 0, time: d.start.time ?? undefined },
      days: d.days ?? undefined,
      drug: m.uses ? { code: m.uses.code, amount: m.uses.amount } : d.drug ? { code: d.drug.code!, amount: d.drug.amount! } : undefined,
      comment: [size, d.comment].filter(Boolean).join("　") || undefined,
    };
    const need = consentFor(order);
    return { order, stopIds: d.duplicate?.action === "replace" ? [d.duplicate.orderId] : [], consents: need && d.consentPlanned ? [need] : [] };
  }
  if (d.kind === "injection") {
    const plan = ratePlan(d);
    const order: InjectionOrder = {
      type: "injection",
      items: d.items.map((it) => ({ drugCode: it.drugCode!, amount: it.amount!, unit: it.unit ?? "" })),
      route: effectiveRoute(d)!,
      schedule: d.schedule!,
      minutesPerDose: effectiveRoute(d) === "点滴静注" && plan.minutesPerDose !== null ? Math.round(plan.minutesPerDose) : undefined,
      rateMlPerH: plan.rateMlPerH ?? undefined,
      start: { day: d.start.day ?? 0, time: d.start.time ?? undefined },
      days: d.days ?? undefined,
      comment: d.comment ?? undefined,
    };
    return { order, stopIds: d.duplicate?.action === "replace" ? [d.duplicate.orderId] : [] };
  }
  const r = resolvedCollect(d, ctx)!;
  // The number of sets belongs to the culture, not to the whole order.
  const cultureCode = d.tests.find((t) => t.code && findLab(t.code)?.needs === "sets")?.code;
  const sets = d.cultureSets && cultureCode ? `${findLab(cultureCode)!.name} ${d.cultureSets}セット` : null;
  const order: LabOrder = {
    type: "lab",
    codes: d.tests.map((t) => t.code!),
    collect: { day: r.day, time: r.time },
    priority: r.priority,
    comment: [sets, r.why && d.collect.when === "before_dose" ? r.why : null, d.comment].filter(Boolean).join("　") || undefined,
  };
  return { order, stopIds: [] };
}
