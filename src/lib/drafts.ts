// Order drafts and the rule-based checks that run on them.
//
// Claude only fills in what the doctor said (see ai-schema.ts). Everything here is plain
// code: unit checks, volume/time/rate arithmetic, duplicates, date interpretation and
// missing fields. Every question offers choices; the doctor picks. Nothing is recommended.

import type { AiDraftResponse, AiOrder } from "./ai-schema";
import { minutesOf } from "./dates";
import { DRUGS, LAB_TESTS, ORDER_SETS, WARD_RULES, anyDrugName, findDrug, findLab, findSet, type DrugMaster } from "./master";
import type {
  DayOffset,
  InjectionOrder,
  InjectionRoute,
  InjectionSchedule,
  LabOrder,
  LabPriority,
  Order,
  OrderEntry,
} from "./types";

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

export interface StopDraft extends DraftBase {
  kind: "stop";
  drugCode: string | null;
  said: string;
  targetOrderId: string | null;
}

export interface UnclearDraft extends DraftBase {
  kind: "unclear";
  reason: string;
}

export type Draft = InjectionDraft | LabDraft | StopDraft | UnclearDraft;

// ---------------------------------------------------------------------------
// From Claude's output to drafts (codes not in the master are dropped to null)
// ---------------------------------------------------------------------------

const DAY: Record<string, DayOffset | null> = { today: 0, tomorrow: 1, day_after_tomorrow: 2, unspecified: null };

const validDrug = (code: string | null) => (code && findDrug(code) ? code : null);
const validLab = (code: string | null) => (code && (findLab(code) || findSet(code)) ? code : null);

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
      drafts.push({ ...base, kind: "stop", drugCode: validDrug(d?.code ?? null), said: d?.said ?? o.source_text, targetOrderId: null });
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
    } else {
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
  return ctx.activeOrders.filter((o) => o.order.type === "injection" && o.order.items[0]?.drugCode === code);
}

/** Running orders of a drug: the main drug of an injection, or an oral prescription. */
function stopTargets(drugCode: string, ctx: CheckContext): OrderEntry[] {
  return ctx.activeOrders.filter(
    (o) => (o.order.type === "injection" && o.order.items[0]?.drugCode === drugCode) || (o.order.type === "prescription" && o.order.drugCode === drugCode),
  );
}

export function resolvedStopTarget(d: StopDraft, ctx: CheckContext): string | null {
  if (d.targetOrderId) return d.targetOrderId;
  if (!d.drugCode) return null;
  const t = stopTargets(d.drugCode, ctx);
  return t.length === 1 ? t[0].id : null;
}

function checkInjection(d: InjectionDraft, ctx: CheckContext): Issue[] {
  const issues: Issue[] = [];
  if (d.items.length === 0) {
    issues.push({ key: "drug", level: "stop", title: "薬", message: "薬が読み取れませんでした。言い直してください。" });
    return issues;
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

export function checkDraft(d: Draft, ctx: CheckContext): Issue[] {
  switch (d.kind) {
    case "injection":
      return checkInjection(d, ctx);
    case "lab":
      return checkLab(d, ctx);
    case "stop":
      return checkStop(d, ctx);
    case "unclear":
      return [{ key: "unclear", level: "ask", title: "聞き取れず", message: d.reason }];
  }
}

export const isReady = (issues: Issue[]) => issues.every((i) => i.level === "info");

// ---------------------------------------------------------------------------
// Confirm: drafts → orders
// ---------------------------------------------------------------------------

export type ConfirmResult = { order?: Order; stopIds: string[] };

/** Only call when isReady(checkDraft(d, ctx)). */
export function toOrder(d: Draft, ctx: CheckContext): ConfirmResult {
  if (d.kind === "stop") {
    const id = resolvedStopTarget(d, ctx);
    return { stopIds: id ? [id] : [] };
  }
  if (d.kind === "unclear") return { stopIds: [] };
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
