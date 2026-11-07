// まとめて操作（経過で選んだ記事・オーダ）: written again on the right (Do), saved as a set, the 中止 drafts to make,
// and the text to copy. Code only; the doctor checks the drafts and confirms them as with any other.

import type { Draft, InjectionDraft, LabDraft } from "./drafts";
import type { PrescriptionDraft } from "./rx";
import { addDays, formatShort, type CalendarDate } from "./dates";
import { drugName, labCardText, oralName, orderLines, scheduleTextFor, timingText } from "./format";
import { findDrug, findOralDrug } from "./master";
import { noteText } from "./notes";
import { setDraft, type SavedSet } from "./saved-sets";
import type { HistoryEntry, NoteEntry, OrderEntry } from "./types";

/** One record carried to the right: a note's text, or a past order (by id). */
export type DoItem = { kind: "note"; text: string; label: string } | { kind: "order"; entryId: string };

/** The orders that can be written again from the record (the same kinds as the single Do): 内服・注射・検体検査. */
export const reusableOrder = (e: OrderEntry): boolean => e.order.type === "prescription" || e.order.type === "injection" || e.order.type === "lab";

/** The orders a 中止 draft can be made for from the record: 有効 内服・注射 not locked by the pharmacy. */
export const stoppableOrders = (entries: OrderEntry[], locked: (id: string) => boolean = () => false): OrderEntry[] =>
  entries.filter((e) => e.status === "有効" && (e.order.type === "prescription" || e.order.type === "injection") && !locked(e.id));

const rxGroup = (e: OrderEntry) => (e.order.type === "prescription" ? `${e.day}|${e.time}|${e.author}|${e.order.rp ?? e.id}` : e.id);

/**
 * Past orders as new drafts, in the order given: the chosen drugs of one Rp together as one 内服, each 注射 and
 * 検体検査 as one. The start (採取の日時) is left empty for the doctor to choose, as with a set's rows; the checks
 * (重複・アレルギー・極量 …) run on them as on any draft. Other kinds are left out.
 */
export function orderDrafts(entries: OrderEntry[], newId: () => string): { draft: Draft; label: string }[] {
  const groups = new Map<string, OrderEntry[]>();
  for (const e of entries) {
    if (!reusableOrder(e)) continue;
    const k = rxGroup(e);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return [...groups.values()].map((g) => {
    const o = g[0].order;
    if (o.type === "prescription") {
      const rx = g.map((e) => e.order).filter((x) => x.type === "prescription");
      const draft: PrescriptionDraft = {
        id: newId(),
        origin: "manual",
        sourceText: "（Do：経過から）",
        comment: o.comment ?? null,
        kind: "prescription",
        ...(o.administration ? { administration: o.administration } : {}),
        ...(o.dayPattern ? { dayPattern: o.dayPattern } : {}),
        ...(o.onePack ? { onePack: true } : {}),
        ...(o.once ? { once: true } : {}),
        category: o.category === "持参薬" ? "定期" : o.category,
        items: rx.map((x) => {
          const byDay = !!x.dailyAmount && x.timings.length > 0;
          return { drugCode: x.drugCode, said: findOralDrug(x.drugCode)?.name ?? x.drugCode, daily: byDay ? x.dailyAmount! : null, perDose: byDay ? null : x.amount };
        }),
        timings: o.administration ? [] : [...o.timings],
        prn: o.prn ?? null,
        maxPerDay: o.maxPerDay ?? null,
        days: o.days ?? null,
        start: { day: null, timing: null },
        acks: [],
      };
      return { draft, label: `内服 ${rx.map((x) => `${oralName(x.drugCode)} 1回${x.amount}${x.unit}`).join(" ＋ ")}　${timingText(o)}${o.days ? `　${o.days}日分` : ""}` };
    }
    if (o.type === "injection") {
      const draft: InjectionDraft = {
        id: newId(),
        origin: "manual",
        sourceText: "（Do：経過から）",
        comment: o.comment ?? null,
        kind: "injection",
        items: o.items.map((it) => ({ drugCode: it.drugCode, said: findDrug(it.drugCode)?.name ?? it.drugCode, amount: it.amount, unit: it.unit })),
        route: o.route,
        schedule: { ...o.schedule },
        ...(o.dayPattern ? { dayPattern: o.dayPattern } : {}),
        ...(o.doseTimes ? { doseTimes: [...o.doseTimes] } : {}),
        ...(o.insulinDoses ? { insulinDoses: o.insulinDoses } : {}),
        ...(o.sliding ? { sliding: o.sliding } : {}),
        infusionMinutes: o.route === "点滴静注" ? o.minutesPerDose ?? null : null,
        infusionScope: o.route === "点滴静注" ? "per_dose" : null,
        // A drip given by rate (and not by time) is copied by its rate, as the injection window does.
        rateMlPerH: o.route === "点滴静注" && !o.minutesPerDose ? o.rateMlPerH ?? null : null,
        prefer: null,
        start: { day: null, time: null },
        days: o.days ?? null,
        duplicate: null,
      };
      return { draft, label: `注射 ${o.items.map((it) => `${drugName(it.drugCode)} ${it.amount}${it.unit}`).join(" ＋ ")}　${o.route}　${scheduleTextFor(o)}` };
    }
    const lab = o.type === "lab" ? o : null;
    const draft: LabDraft = {
      id: newId(),
      origin: "manual",
      sourceText: "（Do：前の検査から）",
      comment: null,
      kind: "lab",
      tests: (lab?.codes ?? []).map((code) => ({ code, said: code })),
      collect: { day: null, when: null, time: null, beforeDose: null },
      priority: null,
      cultureSets: null,
      duplicateOk: false,
    };
    return { draft, label: `検体検査 ${lab ? labCardText(lab, 8) : ""}` };
  });
}

/** Several records carried to the right at once: the notes' texts (for the note) and the orders as drafts, in the order given. */
export function batchDo(items: DoItem[], entries: HistoryEntry[], newId: () => string): { texts: string[]; drafts: Draft[] } {
  const orders = items.flatMap((it) => {
    if (it.kind !== "order") return [];
    const e = entries.find((x): x is OrderEntry => x.kind === "order" && x.id === it.entryId);
    return e ? [e] : [];
  });
  return { texts: items.flatMap((it) => (it.kind === "note" ? [it.text] : [])), drafts: orderDrafts(orders, newId).map((x) => x.draft) };
}

/** The note with the copied texts added at its end, one after another (as the single Do adds one). */
export const appendTexts = (note: string, texts: string[]): string =>
  texts.reduce((n, t) => `${n.replace(/\s*$/, "")}${n.trim() ? "\n" : ""}${t}\n`, note);

/** The line under the note after a Do of several records. */
export const batchDoFlash = (r: { texts: string[]; drafts: Draft[] }): string =>
  `${[r.texts.length ? `記事 ${r.texts.length}件` : "", r.drafts.length ? `オーダの下書き ${r.drafts.length}件` : ""].filter(Boolean).join("・")}を写しました（Do）。日時を選び、直してから確定してください。`;

/** The rows of a set made from chosen orders (the set keeps no patient's dates). */
export function setRowsOf(entries: OrderEntry[], newId: () => string): SavedSet["rows"] {
  return orderDrafts(entries, newId).map(({ draft, label }) => ({ heading: "", note: "", label, draft: setDraft(draft, "") }));
}

/** The chosen records as text to paste elsewhere, one after another with their heading. */
export function recordsText(entries: HistoryEntry[], today: CalendarDate, mark: (e: OrderEntry) => string): string {
  const when = (day: number, time: string) => `${formatShort(addDays(today, day))} ${time}`.trim();
  return entries
    .map((e) => {
      if (e.kind === "note") return `【記事】${when(e.day, e.time)} ${(e as NoteEntry).author}\n${noteText(e)}`;
      const { main, detail } = orderLines(e.order, today);
      return `【${mark(e)}】${when(e.day, e.time)} ${e.author}\n${main}${detail ? `\n${detail}` : ""}`;
    })
    .join("\n\n");
}

/**
 * What the menu of the chosen records can do for this person, and why an item is grey: Do (notes when the role
 * writes notes; 内服・注射・検体検査 when it enters orders), セットに登録 (those orders), 中止の下書き (有効 内服・注射;
 * the doctor), each null reason meaning allowed. A confirmed record is never deleted (the menu has no 削除).
 */
export function pickActions(
  chosen: HistoryEntry[],
  denied: { note: string | null; order: string | null; stop: string | null },
  locked: (id: string) => boolean = () => false,
): { doItems: HistoryEntry[]; setOrders: OrderEntry[]; stopOrders: OrderEntry[]; why: { do?: string; set?: string; stop?: string } } {
  const orders = chosen.filter((e): e is OrderEntry => e.kind === "order");
  const reusable = orders.filter(reusableOrder);
  const doItems = chosen.filter((e) => (e.kind === "note" ? !denied.note : !denied.order && reusableOrder(e)));
  const setOrders = denied.order ? [] : reusable;
  const stopOrders = denied.stop ? [] : stoppableOrders(orders, locked);
  const hasNotes = chosen.some((e) => e.kind === "note");
  return {
    doItems,
    setOrders,
    stopOrders,
    why: {
      do: doItems.length ? undefined : (hasNotes ? denied.note : null) ?? (reusable.length ? denied.order : null) ?? "写せる記録がありません",
      set: setOrders.length ? undefined : (reusable.length ? denied.order : null) ?? "セットにできるオーダ（内服・注射・検体検査）がありません",
      stop: stopOrders.length ? undefined : denied.stop ?? "中止できる有効な内服・注射がありません",
    },
  };
}
