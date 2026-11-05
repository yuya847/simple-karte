// Oral prescriptions (処方) as an Rp: drugs that share one usage. Entered as 1回量・1日◯回・用法
// （例：1回1錠　1日3回　毎食後）, as the MHLW report on how to write oral prescriptions (2010) makes
// the 1回量 the basis; a spoken 1日量・分N is still read, and code works out the other and shows both. Checks are split as in Japanese EHRs: errors that stop the order, and warnings
// the doctor may confirm with a 承知コメント (重複承知・アレルギー承知・極量承知). Nothing is recommended.

import { doseStep } from "./rx-entry";
import type { CheckContext, Draft, Issue } from "./drafts";
import { ORAL_DRUGS, ingredientOf, findOralDrug, WARD_RULES } from "./master";
import { minutesOf } from "./dates";
import type { DayOffset, DoseTiming, PrescriptionOrder } from "./types";

export interface RxItem {
  drugCode: string | null;
  said: string;
  /** 1日量, in the drug's unit. */
  daily: number | null;
  /** 1回量 when the doctor said it that way. */
  perDose: number | null;
}

export interface PrescriptionDraft {
  dispensing?: "院内" | "院外";
  once?: boolean;
  alreadyDone?: boolean;
  id: string;
  origin: "ai" | "manual";
  sourceText: string;
  comment: string | null;
  kind: "prescription";
  onePack?: boolean;
  /** 持参薬 only comes from the pharmacist's 持参薬鑑別 (the doctor's choice there), never from the Rp editor. */
  category: "定期" | "臨時" | "退院時" | "持参薬" | null;
  items: RxItem[];
  /** 服用時点. Empty with `prn` set = 頓用. null = not said. */
  timings: DoseTiming[] | null;
  prn: string | null;
  maxPerDay: number | null;
  days: number | null;
  start: { day: DayOffset | null; timing: DoseTiming | null };
  acks: string[];
  /** The 持参薬鑑別 report this draft answers (it becomes 指示済 when the draft is confirmed). */
  reportId?: string;
  /** The doctor's reason for a 併用禁忌, by pair id (interactions.ts). */
  interactionReasons?: Record<string, string>;
}

/** 用法 of this ward (as in the Rp editor). */
export const USAGES: { label: string; timings: DoseTiming[] }[] = [
  { label: "分1 朝食後", timings: ["朝"] },
  { label: "分1 夕食後", timings: ["夕"] },
  { label: "分1 眠前", timings: ["眠前"] },
  { label: "分2 朝夕食後", timings: ["朝", "夕"] },
  { label: "分3 毎食後", timings: ["朝", "昼", "夕"] },
];

/** When to take it, by the number of times a day (the choices offered for each). */
export const TIMINGS_BY_TIMES: Record<number, { label: string; timings: DoseTiming[] }[]> = {
  1: [
    { label: "朝食後", timings: ["朝"] },
    { label: "昼食後", timings: ["昼"] },
    { label: "夕食後", timings: ["夕"] },
    { label: "眠前", timings: ["眠前"] },
  ],
  2: [
    { label: "朝夕食後", timings: ["朝", "夕"] },
    { label: "朝食後・眠前", timings: ["朝", "眠前"] },
  ],
  3: [{ label: "毎食後", timings: ["朝", "昼", "夕"] }],
  4: [{ label: "毎食後・眠前", timings: ["朝", "昼", "夕", "眠前"] }],
};

/** "毎食後", "朝夕食後", "眠前" … for the timings. */
export function timingName(timings: DoseTiming[]): string {
  const hit = (TIMINGS_BY_TIMES[timings.length] ?? []).find((t) => t.timings.join() === timings.join());
  return hit?.label ?? timings.join("・");
}

/** "1日3回　毎食後" / "頓用 疼痛時（1日3回まで）" — how often, after the 1回量. */
export function howText(timings: DoseTiming[] | null, prn: string | null, maxPerDay: number | null): string {
  if (timings === null) return "用法？";
  if (timings.length === 0) return `頓用 ${prn ?? "条件？"}${maxPerDay ? `（1日${maxPerDay}回まで）` : ""}`;
  return `1日${timings.length}回　${timingName(timings)}`;
}

export function usageLabel(timings: DoseTiming[]): string {
  const hit = USAGES.find((u) => u.timings.join() === timings.join());
  return hit?.label ?? `分${timings.length} ${timings.join("・")}`;
}

const ORDER: DoseTiming[] = ["朝", "昼", "夕", "眠前"];
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 1回量 from what was said: the said 1回量, or 1日量 ÷ 回数 (頓用: the 1回量). */
export function perDoseOf(it: RxItem, times: number): number | null {
  if (it.perDose !== null) return it.perDose;
  if (it.daily === null || times <= 0) return null;
  return round2(it.daily / times);
}

/** First ward dose time on or after now. */
export function firstDose(timings: DoseTiming[], nowTime: string): { day: DayOffset; timing: DoseTiming } {
  const sorted = [...timings].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const now = minutesOf(nowTime);
  const today = sorted.find((t) => minutesOf(WARD_RULES.medTimes[t]) > now);
  return today ? { day: 0, timing: today } : { day: 1, timing: sorted[0] };
}

export const ACK = { 重複: "重複承知", アレルギー: "アレルギー承知", 極量: "極量承知" } as const;

function candidates(said: string) {
  const s = said.replace(/\s/g, "");
  return ORAL_DRUGS.filter((d) => [d.name, ...d.aliases].some((a) => s && (a.includes(s) || s.includes(a)))).slice(0, 4);
}

/** The latest leave draft takes precedence over confirmed active orders of this patient. */
export function dischargeLeave(ctx: Pick<CheckContext, "drafts" | "activeOrders">) {
  const draft = ctx.drafts.findLast((d) => d.kind === "procedure" && d.leave?.kind === "退院");
  if (draft?.kind === "procedure" && draft.leave) return draft.leave;
  const entry = [...ctx.activeOrders].sort((a, b) => b.day - a.day || b.time.localeCompare(a.time)).find((e) => e.status === "有効" && e.order.type === "procedure" && e.order.leave?.kind === "退院");
  return entry?.order.type === "procedure" ? entry.order.leave : undefined;
}

export function dischargeStartDay(d: PrescriptionDraft, ctx: Pick<CheckContext, "drafts" | "activeOrders">): number | null {
  if (d.start.day !== null) return d.start.day;
  const leave = dischargeLeave(ctx);
  return leave?.from.day ?? null;
}

export function checkPrescription(d: PrescriptionDraft, ctx: CheckContext, allergies: string[] = []): Issue[] {
  const issues: Issue[] = [];
  const set = (patch: Partial<PrescriptionDraft>) => (x: Draft) => ({ ...(x as PrescriptionDraft), ...patch });
  const ack = (a: string) => (x: Draft) => ({ ...(x as PrescriptionDraft), acks: [...new Set([...(x as PrescriptionDraft).acks, a])] });
  if (!d.items.length) return [{ key: "drug", level: "stop", title: "薬", message: "薬が読み取れませんでした。言い直してください。" }];

  const prn = d.timings !== null && d.timings.length === 0;
  const times = d.timings?.length ?? 0;

  if (d.category === "退院時" && dischargeStartDay(d, ctx) === null) {
    issues.push({ key: "discharge-day", level: "ask", title: "退院日", message: "退院オーダを入力するか、退院日を指定してください。", choices: [0, 1, 2, 3, 4, 5, 6, 7].map((day) => ({ label: ctx.fmtDay(day), apply: set({ start: { day, timing: d.timings?.[0] ?? null } }) })) });
  }
  // 区分・用法・日数
  if (!d.category && !prn) {
    issues.push({ key: "category", level: "ask", title: "区分", message: "定期か臨時かが抜けています。", choices: (["定期", "臨時"] as const).map((c) => ({ label: c, apply: set({ category: c }) })) });
  }
  if (d.timings === null) {
    issues.push({
      key: "usage",
      level: "ask",
      title: "用法",
      message: "用法（分何回・いつ）が抜けています。",
      choices: [...USAGES.map((u) => ({ label: u.label, apply: set({ timings: u.timings }) })), { label: "頓用", apply: set({ timings: [], prn: d.prn ?? "必要時" }) }],
    });
  }
  if (!prn && d.timings !== null && d.days === null) {
    issues.push({ key: "days", level: "ask", title: "日数", message: "日数が抜けています。", choices: [3, 5, 7, 14].map((n) => ({ label: `${n}日分`, apply: set({ days: n }) })) });
  }

  d.items.forEach((it, i) => {
    const m = it.drugCode ? findOralDrug(it.drugCode) : undefined;
    if (!m) {
      issues.push({
        key: `drug-${i}`,
        level: "stop",
        title: "薬",
        message: `「${it.said}」は院内の内服薬マスターにありません。`,
        choices: candidates(it.said).map((c) => ({
          label: `${c.name} ${c.strength}`,
          apply: (x) => ({ ...(x as PrescriptionDraft), items: (x as PrescriptionDraft).items.map((y, j) => (j === i ? { ...y, drugCode: c.code } : y)) }),
        })),
      });
      return;
    }
    if (it.daily === null && it.perDose === null) {
      issues.push({ key: `amount-${i}`, level: "ask", title: "量", message: `${m.name} ${m.strength} の量（1日量）が抜けています。` });
      return;
    }
    if (d.timings === null) return;
    const per = perDoseOf(it, prn ? 1 : times);
    if (per === null) return;
    // 1回量 must be whole units, or halves of a scored tablet.
    const step = doseStep(m);
    if (Math.abs(per / step - Math.round(per / step)) > 1e-9 || per <= 0) {
      issues.push({
        key: `split-${i}`,
        level: "stop",
        title: "1回量",
        message: `${m.name}：1日${it.daily}${m.unit} を${times}回に分けると1回 ${per}${m.unit} になり、${step === 0.5 ? "半錠単位" : `${step}${m.unit}単位`}で割り切れません。`,
      });
    } else if (!prn && it.perDose === null) {
      issues.push({ key: `per-${i}`, level: "info", title: "1回量", message: m.name, formula: `1日${it.daily}${m.unit} ÷ ${times}回 = 1回${per}${m.unit}` });
    }
    // 極量
    const dailyUnits = prn ? per * (d.maxPerDay ?? 1) : it.daily ?? per * times;
    if (m.maxDailyMg && m.mg && dailyUnits * m.mg > m.maxDailyMg.mg && !d.acks.includes(ACK.極量)) {
      issues.push({
        key: `max-${i}`,
        level: "ask",
        title: "極量",
        message: `${m.name}：1日 ${dailyUnits * m.mg}mg（${prn ? `1回${per}${m.unit} × 1日${d.maxPerDay ?? 1}回まで` : `1日${dailyUnits}${m.unit}`}）は、${m.maxDailyMg.source}を超えます。`,
        choices: [{ label: `承知して出す（${ACK.極量}）`, apply: ack(ACK.極量) }],
      });
    }
    // アレルギー（薬の分類と、カルテのアレルギーの言葉）
    const hit = (m.classes ?? []).find((c) => allergies.some((a) => a.includes(c)));
    if (hit && !d.acks.includes(ACK.アレルギー)) {
      issues.push({
        key: `allergy-${i}`,
        level: "ask",
        title: "アレルギー",
        message: `${m.name}は「${hit}」です。カルテのアレルギー：${allergies.join("、")}`,
        choices: [{ label: `承知して出す（${ACK.アレルギー}）`, apply: ack(ACK.アレルギー) }],
      });
    }
    // 重複（同じ成分の内服が有効）
    const ing = ingredientOf(m.code);
    // A 退院時処方 repeats what is taken on the ward on purpose: compare it only with other 退院時処方.
    const home = (o: PrescriptionOrder) => o.category === "退院時";
    const same = ctx.activeOrders.filter((o) => o.order.type === "prescription" && ingredientOf(o.order.drugCode) === ing && home(o.order) === (d.category === "退院時"));
    if (same.length && !d.acks.includes(ACK.重複)) {
      issues.push({
        key: `dup-${i}`,
        level: "ask",
        title: "重複",
        message: `同じ成分（${ing}）の内服が有効です：${same.map((o) => ctx.describe(o)).join("／")}`,
        choices: [{ label: `承知して出す（${ACK.重複}）`, apply: ack(ACK.重複) }],
      });
    }
  });

  if (d.acks.length) issues.push({ key: "acks", level: "info", title: "承知", message: d.acks.join("・") });
  if (prn && !d.prn) issues.push({ key: "prn", level: "ask", title: "頓用", message: "頓用の条件（発熱時・疼痛時など）が抜けています。" });
  return issues;
}

/** One order per drug, all sharing the Rp. Only call when the checks are all info. */
export function toPrescriptionOrders(d: PrescriptionDraft, nowTime: string, rpId: string, dischargeDay?: number | null): PrescriptionOrder[] {
  const prn = d.timings!.length === 0;
  if (d.category === "退院時" && d.start.day === null && dischargeDay == null) throw new Error("退院日を指定してください。");
  const start = d.category === "退院時" ? { day: d.start.day ?? dischargeDay ?? 0, ...(!prn ? { timing: d.start.timing ?? d.timings![0] } : {}) } : prn ? { day: 0 } : d.start.day !== null && d.start.timing ? { day: d.start.day, timing: d.start.timing } : firstDose(d.timings!, nowTime);
  return d.items.map((it) => {
    const m = findOralDrug(it.drugCode!)!;
    const per = perDoseOf(it, prn ? 1 : d.timings!.length)!;
    return {
      type: "prescription",
      dispensing: d.dispensing,
      category: d.category === "退院時" || d.category === "持参薬" ? d.category : prn ? "臨時" : d.category!,
      drugCode: m.code,
      amount: per,
      unit: m.unit,
      timings: d.timings!,
      ...(d.once ? { once: { day: 0, time: nowTime } } : {}),
      ...(prn && !d.once ? { prn: d.prn ?? "必要時", maxPerDay: d.maxPerDay ?? undefined } : {}),
      start,
      days: prn && !d.dispensing ? undefined : (d.days ?? undefined),
      comment: [d.comment, d.onePack ? "一包化" : null].filter(Boolean).join("　") || undefined,
      onePack: !!d.onePack,
      rp: rpId,
      dailyAmount: prn ? undefined : (it.daily ?? round2(per * d.timings!.length)),
      acks: d.acks.length ? d.acks : undefined,
    };
  });
}
