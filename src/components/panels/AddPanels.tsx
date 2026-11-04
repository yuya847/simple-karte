"use client";

import { injectionDrugLabel } from "@/lib/injection-drug-label";
import { rxEntryLines, rxEntryStep, validDose, type RxStep } from "@/lib/rx-entry";
import { todayInTokyo } from "@/lib/dates";
import { orderDefaults, onceInfusionMinutes, ONCE_INFUSION_HINT } from "@/lib/order-defaults";
import { nextRegularDay, regularDayOffset, REGULAR_RX_DAYS } from "@/lib/rx-schedule";
import { History } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { InjectionEntryRow } from "./InjectionEntryRow";
import { TabChoice } from "../TabChoice";
import { decideHint } from "@/lib/decide-hint";
import { doseVolumeMl, newProcedureDraft, type Draft, type InjectionDraft } from "@/lib/drafts";
import type { InjSeed } from "@/lib/inj-calendar";
import type { ConsultOrder, GuideOrder, LeaveOrder, HdOrder, InjectionOrder, InjectionRoute, InjectionSchedule, OrderEntry, Patient, RehabOrder, TxOrder } from "@/lib/types";
import { rpLine, rpNumbers } from "@/lib/rp";
import { DecidedEntryLines, DoseTimesEntry, LineEntry, RpDrugSearch } from "../LineEntry";
import { injectionEntryLines, automaticInjectionEnd, defaultDoseTimes, parseDuration, validateInjectionEnd, injEntryStep, nextInjectionStart, type InjStep } from "@/lib/inj-entry";
import { DRUGS, ORAL_DRUGS, ORAL_MASTER_SOURCE, findOralDrug } from "@/lib/master";
import { nameIn, pickable, useMasterLocal } from "@/lib/master-local";
import { TIMINGS_BY_TIMES, howText } from "@/lib/rx";
import { loadSets, matchPattern, patternLine, saveSets, type RxPattern, type RxSet } from "@/lib/rx-memory";
import { matchInj, type InjPattern } from "@/lib/inj-memory";
import { scheduleLabel } from "@/lib/format";
import { PHYSIO, emptyPhysio } from "@/lib/exams";
import { CONSULT_DEPTS, GUIDE_TO, REHAB_FIELDS, consultText } from "@/lib/procedures";
import { HD_ACCESS, HD_ANTICOAG, HD_MEMBRANES, HD_METHODS, HD_MINUTES, HD_PURPOSES, HD_QB, HD_UF, HD_UF_RATE, PROCEDURES, TX_GUIDE, TX_NOTICE, TX_PACE, TX_PRODUCTS, findProc, findProcDrug, hdUfRate, procScheduleText, txEffect, txMinutes, txVolume } from "@/lib/procedures";

const SCHEDULES: { label: string; value: InjectionSchedule }[] = [
  { label: "1回だけ", value: { kind: "once" } },
  { label: "1日1回", value: { kind: "per_day", count: 1 } },
  { label: "1日2回", value: { kind: "per_day", count: 2 } },
  { label: "1日3回", value: { kind: "per_day", count: 3 } },
  { label: "1日4回", value: { kind: "per_day", count: 4 } },
  { label: "6時間ごと", value: { kind: "every_hours", hours: 6 } },
  { label: "8時間ごと", value: { kind: "every_hours", hours: 8 } },
  { label: "12時間ごと", value: { kind: "every_hours", hours: 12 } },
  { label: "24時間ごと", value: { kind: "every_hours", hours: 24 } },
];
const FLUID_SCHEDULES: { label: string; value: InjectionSchedule }[] = [...[1, 2, 3, 4].map((c) => ({ label: `1日${c}本`, value: { kind: "per_day" as const, count: c } })), { label: "1回だけ", value: { kind: "once" } }];
const DRIP_MINUTES = [15, 30, 60, 90, 120, 180, 240, 360, 480, 720, 1440];
const DRIP_RATES = [20, 40, 60, 80, 100, 125, 200];
const minutesLabel = (m: number) => (m < 60 ? `${m}分` : m % 60 === 0 ? `${m / 60}時間` : `${Math.floor(m / 60)}時間${m % 60}分`);

interface InjRow {
  drugCode: string;
  amount: string;
  unit: string;
}
/**
 * Routes as the ward says them. 末梢静脈 is a drip, ワンショット an IV push, ロック a flush of 生食 or
 * heparin to keep the line open (given as 静注; the word ロック goes into the order's comment).
 */
const ROUTE_TABS: { key: string; route: InjectionRoute; lock?: boolean; title: string }[] = [
  { key: "末梢静脈", route: "点滴静注", title: "末梢静脈からの点滴（点滴静注）" },
  { key: "ワンショット", route: "静注", title: "静脈注射（ワンショット）" },
  { key: "筋注", route: "筋注", title: "筋肉注射" },
  { key: "皮下注", route: "皮下注", title: "皮下注射" },
  { key: "ロック", route: "静注", lock: true, title: "生食・ヘパリンでルートの閉塞を防ぐ（静注として出す）" },
];
const masterOf = (code: string) => DRUGS.find((d) => d.code === code);
/** Whether every drug in the Rp can be given this way. */
const routeOk = (rows: InjRow[], tab: (typeof ROUTE_TABS)[number]) =>
  rows.length > 0 && (tab.lock ? rows.every((r) => masterOf(r.drugCode)?.lock) : rows.every((r) => masterOf(r.drugCode)?.routes.includes(tab.route)));

interface InjRp {
  step?: InjStep;
  rows: InjRow[];
  /** The route tab chosen (ROUTE_TABS key), "" until chosen. */
  route: string;
  sched: number;
  minutes: number;
  /** A drip is given either by time per dose or by rate (mL/時); null = by what fits (fluid → rate). */
  rateMode: "time" | "rate" | null;
  rate: string;
  startDay: number;
  startTime: string;
  startNow?: boolean;
  days: string;
  comment: string;
  /** Decided (決める): shown as one line of what was chosen, the choice buttons put away until 直す. */
  done: boolean;
  alreadyDone?: boolean;
  doseTimes?: string[];
  endDay?: number;
  endTime?: string;
}
const newInjRp = (): InjRp => ({ rows: [], route: "", sched: -1, minutes: 0, rateMode: null, rate: "", startDay: 0, startTime: "", days: "1", comment: "", done: false, step: "drug" });
const rowFor = (code: string): InjRow => {
  const d = DRUGS.find((x) => x.code === code)!;
  return {
    drugCode: code,
    amount: d.kind === "輸液" ? "1" : d.strength ? String(d.strength.amount) : "1",
    unit: d.kind === "輸液" ? (d.units.includes("本") ? "本" : d.units[0]) : (d.strength?.unit ?? d.units[0]),
  };
};
/** The route tabs open for these drugs. */
const routeTabsFor = (rows: InjRow[]) => ROUTE_TABS.filter((t) => routeOk(rows, t));
const routeOf = (rp: InjRp): InjectionRoute | null => ROUTE_TABS.find((t) => t.key === rp.route)?.route ?? null;

/**
 * A drug search inside one Rp. Keyboard: type, ↓ ↑ to move in the list, Enter to put the drug in,
 * Esc to clear. The box stays for the next drug (混注 or another drug of the same Rp).
 */
/** Focus the first box of a panel when it opens, and ⌘Enter / Ctrl+Enter anywhere in it to make the drafts. */
function usePanelKeys(submit: () => void) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.querySelector<HTMLInputElement>("input[role=combobox]")?.focus();
  }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };
  return { root, onKeyDown };
}

/** The drafts already collected under the note, numbered Rp1, Rp2 … (shown at the top of the window). */
function CollectedRps({ drafts, kind }: { drafts: Draft[]; kind: "injection" | "prescription" }) {
  const mine = drafts.filter((d) => d.kind === kind);
  const no = rpNumbers(drafts);
  if (mine.length === 0) return null;
  return (
    <section className="rounded-md border border-rule bg-paper p-2">
      <h3 className="mb-1 text-[11px] font-bold text-ink-soft">記事の下に貯まっている{kind === "injection" ? "注射" : "内服"}（確定はまだ）</h3>
      <ol className="space-y-0.5 text-[12px]">
        {mine.map((d) => (
          <li key={d.id} className="nums flex gap-2">
            <b className="shrink-0 text-ai">Rp{no[d.id]}</b>
            <span>{rpLine(d)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Injections by Rp, like the prescription window: put one or more drugs in an Rp (混注: the main
 * drug, drugs mixed in, and the fluid), then the route, frequency, drip time and start. Each Rp
 * becomes a draft that goes through the same checks as a spoken one; the doctor confirms.
 */
export function AddInjectionPanel({ onAdd, newId, drafts, seed, memory, patientId = "" }: { patientId?: string; onAdd: (d: Draft[]) => void; newId: () => string; drafts: Draft[]; seed?: InjSeed; memory?: { patterns: InjPattern[]; previous: InjPattern[] } }) {
  const [category, setCategory] = useState<"定期" | "臨時">("定期");
  const freshRp = (kind = category): InjRp => {
    const now = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date());
    const defaults = orderDefaults(patientId, kind, now);
    return { ...newInjRp(), sched: SCHEDULES.findIndex((s) => s.value.kind === defaults.schedule.kind), startNow: defaults.imagingTime !== null || kind === "臨時", startTime: defaults.start.time, doseTimes: [defaults.start.time] };
  };
  const [rps, setRps] = useState<InjRp[]>(() => [freshRp()]);
  // For the visible headings (label) of the 開始・日数・コメント fields of each Rp.
  const uid = useId();
  // 注射の記憶 / Do: the order copied into the first empty Rp.
  const putOrder = (o: InjectionOrder) =>
    setRps((r) => {
      const rp = rpFromOrder(o);
      const i = r.findIndex((x) => x.rows.length === 0);
      const out = i < 0 ? [...r, rp] : r.map((x, j) => (j === i ? rp : x));
      return out.some((x) => x.rows.length === 0) ? out : [...out, freshRp()];
    });
  // 修正 from the calendar (the order, to be changed and drafted again), Do (the order and its new start), or
  // a new injection from a day of the calendar (only the start): put into the first empty Rp.
  const [seeded, setSeeded] = useState<string | null>(null);
  const [focusRp, setFocusRp] = useState<{ key: string; at: number } | null>(null);
  if (seed && seed.key !== seeded) {
    setSeeded(seed.key);
    const rp = rpFromSeed(seed);
    setRps((r) => {
      const i = r.findIndex((x) => x.rows.length === 0);
      return i < 0 ? [...r, rp] : r.map((x, j) => (j === i ? rp : x));
    });
    // Only the start came: the doctor picks the drug next, so the search box of that Rp takes the focus.
    if (!seed.order) {
      const at = rps.findIndex((x) => x.rows.length === 0);
      setFocusRp({ key: seed.key, at: at < 0 ? rps.length : at });
    }
  }
  const first = drafts.filter((d) => d.kind === "injection").length + 1;
  const upd = (i: number, patch: Partial<InjRp>) =>
    setRps((r) =>
      r.map((x, j) => {
        if (j !== i) return x;
        const next = { ...x, ...patch };
        if (patch.startNow === undefined && (patch.startTime !== undefined || patch.startDay !== undefined || patch.doseTimes !== undefined)) next.startNow = false;
        if (patch.minutes !== undefined) next.rateMode = "time";
        if (patch.sched !== undefined && patch.sched >= 0) {
          next.doseTimes = defaultDoseTimes(schedulesOf(next)[patch.sched]?.value);
          if (schedulesOf(next)[patch.sched]?.value.kind === "once") next.doseTimes = [next.startTime || new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date())];
        }
        // Keep the route valid for every drug; choose it when only one is left.
        const open = routeTabsFor(next.rows);
        if (next.route && !open.some((t) => t.key === next.route)) next.route = "";
        if (!next.route && open.length === 1) next.route = open[0].key;
        if (patch.rows && x.rows.length === 0 && next.rows.length) {
          const defaults = orderDefaults(patientId, category, next.startTime);
          next.sched = schedulesOf(next).findIndex((s) => s.value.kind === defaults.schedule.kind);
        }
        if (next.sched >= schedulesOf(next).length) next.sched = -1;
        if (schedulesOf(next)[next.sched]?.value.kind === "once" && isFluidRp(next) && next.rateMode === null && (patch.rows || patch.sched !== undefined)) {
          const minutes = onceInfusionMinutes(doseVolumeMl(next.rows.map((r) => ({ drugCode: r.drugCode, amount: Number(r.amount) || null, unit: r.unit }))) ?? 0);
          if (minutes) next.minutes = minutes;
        }
        return next;
      }),
    );
  const focus = (i: number, step: InjStep) => {
    upd(i, { step });
    requestAnimationFrame(() => {
      const row = panelRoot.current?.querySelector<HTMLElement>(`[data-rp="${i}"] [data-step="${step}"]`);
      // The text field first (the 1回の時間 line has toggle buttons before its field), then a chosen chip, then any button.
      (row?.querySelector<HTMLElement>("input, select") ?? row?.querySelector<HTMLElement>('button[tabindex="0"]:not(:disabled)') ?? row?.querySelector<HTMLElement>("button:not(:disabled)"))?.focus();
    });
  };
  const fluids = DRUGS.filter((d) => d.kind === "輸液");
  // 抗がん薬 are ordered from the regimen panel only. マスタ管理: 採用 and not 中止, in 表示順, with the 院内名.
  const ml = useMasterLocal();
  const options = pickable("注射薬", DRUGS.filter((d) => !d.chemo), ml).map((d) => ({ code: d.code, name: d.name, sub: injectionDrugLabel(d).supplement, aliases: [d.name, d.generic ?? "", d.category ?? "", nameIn(ml, "注射薬", d.code, ""), ...d.aliases] }));
  const missingOf = (rp: InjRp) => [
    ...(rp.rows.every((r) => Number(r.amount) > 0 && r.unit) ? [] : ["量"]),
    ...validateInjectionEnd(rp.startDay, rp.startTime, Number(rp.days), rp.endDay, rp.endTime, rp.minutes, rp.doseTimes),
    ...(rp.doseTimes?.length && rp.sched >= 0 && schedulesOf(rp)[rp.sched].value.kind !== "once" && rp.doseTimes.length !== defaultDoseTimes(schedulesOf(rp)[rp.sched].value).length ? ["回数と投与時刻の数が一致していません"] : []),
    ...(rp.route ? [] : ["経路"]),
    ...(rp.sched >= 0 ? [] : ["回数"]),
    ...(routeOf(rp) === "点滴静注" && (modeOf(rp) === "time" ? !rp.minutes : !(Number(rp.rate) > 0)) ? [modeOf(rp) === "time" ? "1回の時間" : "速度"] : []),
  ];
  const complete = (rp: InjRp) => rp.rows.length > 0 && missingOf(rp).length === 0;
  // 決める: put the choice buttons away and show only what was chosen; go on to the next empty Rp.
  const decide = (i: number) => {
    if (!complete(rps[i])) return;
    const next = rps.findIndex((x, j) => j > i && x.rows.length === 0);
    setRps((r) => {
      const out = r.map((x, j) => (j === i ? { ...x, done: true } : x));
      return next < 0 ? [...out, freshRp()] : out;
    });
    const at = next < 0 ? rps.length : next;
    requestAnimationFrame(() => panelRoot.current?.querySelector<HTMLInputElement>(`[data-rp="${at}"] input[role=combobox]`)?.focus());
  };
  const reopen = (i: number) => {
    setRps((r) => r.map((x, j) => (j === i ? { ...x, done: false, step: "dose" } : x)));
    requestAnimationFrame(() => panelRoot.current?.querySelector<HTMLElement>(`[data-rp="${i}"] input[inputmode=decimal]`)?.focus());
  };
  // Moving into another Rp decides the finished ones (they fold to one line).
  const foldOthers = (i: number) =>
    setRps((r) => (r.some((x, j) => j !== i && !x.done && complete(x)) ? r.map((x, j) => (j !== i && !x.done && complete(x) ? { ...x, done: true } : x)) : r));
  const filled = rps.filter((r) => r.rows.length > 0);
  // An Rp started but not finished is never dropped quietly: it blocks until filled or emptied.
  const unfinished = rps.map((r, i) => ({ i, miss: r.rows.length ? missingOf(r) : [] })).filter((x) => x.miss.length);
  const ready = unfinished.length ? [] : filled;

  const toDraft = (rp: InjRp): InjectionDraft => {
    const route = routeOf(rp);
    const lock = ROUTE_TABS.find((t) => t.key === rp.route)?.lock;
    const comment = [lock ? "ロック" : "", rp.comment.trim()].filter(Boolean).join("　");
    return {
      id: newId(),
      origin: "manual",
      sourceText: rp.rows.length > 1 ? "（マスターから選択・混注）" : "（マスターから選択）",
      comment: comment || null,
      kind: "injection",
      alreadyDone: rp.alreadyDone,
      startNow: rp.startNow,
      doseTimes: rp.doseTimes,
      end: rp.endTime ? { day: rp.endDay ?? rp.startDay, time: rp.endTime } : schedulesOf(rp)[rp.sched].value.kind === "once" && rp.minutes && rp.startTime ? automaticInjectionEnd(rp.startDay, rp.startTime, 1, [], rp.minutes) ?? undefined : undefined,
      items: rp.rows.map((r) => {
        const d = masterOf(r.drugCode)!;
        return { drugCode: r.drugCode, said: d.name, amount: Number(r.amount), unit: r.unit };
      }),
      route,
      schedule: schedulesOf(rp)[rp.sched].value,
      infusionMinutes: route === "点滴静注" && modeOf(rp) === "time" ? rp.minutes : null,
      infusionScope: route === "点滴静注" ? "per_dose" : null,
      rateMlPerH: route === "点滴静注" && modeOf(rp) === "rate" ? Number(rp.rate) : null,
      prefer: null,
      start: { day: rp.startDay, time: rp.startTime || null },
      days: Number(rp.days) > 0 ? Number(rp.days) : null,
      duplicate: null,
    };
  };
  const submit = () => {
    if (!ready.length) return;
    onAdd(ready.map(toDraft));
    setRps([freshRp()]);
  };
  const { root: panelRoot, onKeyDown: panelKeys } = usePanelKeys(submit);
  useEffect(() => {
    if (focusRp) panelRoot.current?.querySelector<HTMLInputElement>(`[data-rp="${focusRp.at}"] input[role=combobox]`)?.focus();
  }, [focusRp, panelRoot]);

  const field = "rounded border border-rule bg-paper px-1 py-0.5 outline-none focus:border-ai";
  // The 注射の記憶 icon sits by the search box of the Rp a remembered injection would go into.
  const memoryAt = rps.findIndex((x) => x.rows.length === 0);
  return (
    <div ref={panelRoot} onKeyDown={panelKeys} className="space-y-3 text-[13px]">
      <CollectedRps drafts={drafts} kind="injection" />
      <TabChoice label="注射の区分" options={["定期", "臨時"].map((v) => ({ value: v as "定期" | "臨時", label: v }))} value={category} onChange={(v) => { setCategory(v); setRps((rs) => rs.map((r) => { const d = freshRp(v); return { ...r, sched: schedulesOf(r).findIndex((s) => s.value.kind === SCHEDULES[d.sched].value.kind), startDay: 0, startNow: d.startNow, startTime: d.startTime, doseTimes: d.doseTimes }; })); }} />
      <p className="hint text-[11px] text-ink-faint">キーボードだけで入れられます：薬の名前を打って ↓↑ と Enter、Tab で次の欄へ、経路・回数は数字キー、時間は ← → で選ぶ。日数で Enter を押すと1行にたたみ、次の Rp へ。⌘Enter（Ctrl+Enter）で下書きにする。Shift+Enter または「＋混注」で同じ Rp に薬を足します。Esc で前の欄へ。量を空にして Backspace でその薬を外します。薬の欄の横の時計の印が「注射の記憶」（この患者の前回の注射・自分のよく出す注射）です。</p>

      <LineEntry>
      {rps.map((rp, i) => {
        const open = routeTabsFor(rp.rows);
        const schedules = schedulesOf(rp);
        const route = routeOf(rp);
        const volume = doseVolumeMl(rp.rows.map((r) => ({ drugCode: r.drugCode, amount: Number(r.amount), unit: r.unit })));
        const duration = modeOf(rp) === "time" ? rp.minutes : Number(rp.rate) > 0 ? volume * 60 / Number(rp.rate) : 0;
        const autoEnd = automaticInjectionEnd(rp.startDay, rp.startTime, Number(rp.days) || 1, rp.doseTimes, duration);

        if (rp.done && complete(rp))
          return (
            <section key={i} data-rp={i} className="flex items-start gap-2 py-2">
              <b className="shrink-0 text-ai">Rp{first + i}</b>
              <button type="button" onClick={() => reopen(i)} title="押すと直せます" className="nums min-w-0 flex-1 text-left text-[12px] leading-relaxed">
                <RpSummary rp={rp} />
              </button>
              <button type="button" onClick={() => reopen(i)} className="shrink-0 rounded border border-rule bg-sheet px-2 py-0.5 text-[11px] text-ink-soft hover:border-ai hover:text-ai pointer-coarse:py-1.5">
                直す
              </button>
              <button type="button" tabIndex={-1} onClick={() => setRps((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : [freshRp()]))} className="shrink-0 text-[11px] text-ink-faint hover:text-shu">
                消す
              </button>
            </section>
          );
        return (
          <section key={i} data-rp={i} onFocusCapture={() => foldOthers(i)} onKeyDownCapture={(e) => {
            if (e.key !== "ArrowUp" || e.nativeEvent.isComposing || e.metaKey || e.ctrlKey) return;
            const current = (e.target as HTMLElement).closest<HTMLElement>("[data-step]")?.dataset.step as InjStep | undefined;
            if (!current || current === "drug") return;
            e.preventDefault(); e.stopPropagation(); focus(i, injEntryStep(current, "ArrowUp", route === "点滴静注"));
          }} onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.metaKey || e.ctrlKey || e.defaultPrevented) return;
            if (e.shiftKey && e.key === "Enter" && rp.rows.length) { e.preventDefault(); focus(i, "drug"); return; }
            const target = e.target as HTMLElement;
            if (target.getAttribute("role") === "combobox") return;
            const current = target.closest<HTMLElement>("[data-step]")?.dataset.step as InjStep | undefined;
            if (!current) return;
            const group = target.closest('[role="radiogroup"]');
            if (group && /^[1-9]$/.test(e.key)) {
              const buttons = group.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
              const button = buttons[Number(e.key) - 1];
              if (button) { e.preventDefault(); button.click(); button.focus(); } return;
            }
            if (!["Enter", "Tab", "Escape", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key) || e.shiftKey) return;
            if (group && ["ArrowLeft", "ArrowRight", "ArrowDown"].includes(e.key)) return;
            if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Tab") {
              const fields = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(`[data-step="${current}"] input, [data-step="${current}"] select, [data-step="${current}"] button[tabindex="0"]`)).filter((el) => !el.closest("[hidden]") && !el.hasAttribute("disabled"));
              const at = fields.indexOf(target);
              const next = fields[at + (e.key === "ArrowLeft" ? -1 : 1)];
              if (next) { e.preventDefault(); next.focus(); return; }
            }
            e.preventDefault();
            const backwards = e.key === "Escape" || e.key === "ArrowUp" || e.key === "ArrowLeft";
            if (!backwards && current === "route" && !rp.route) { upd(i, { route: open[0]?.key ?? "" }); focus(i, "schedule"); return; }
            if (!backwards && current === "schedule" && rp.sched < 0) { upd(i, { sched: 0 }); focus(i, "times"); return; }
            const valid = current === "dose" ? rp.rows.every((r) => Number(r.amount) > 0) : current === "duration" ? modeOf(rp) === "time" ? rp.minutes > 0 : Number(rp.rate) > 0 : current === "days" ? Number.isInteger(Number(rp.days)) && Number(rp.days) > 0 : current === "times" ? !validateInjectionEnd(rp.startDay, rp.startTime, 1, undefined, undefined, 0, rp.doseTimes).length : true;
            if (!backwards && current === "times" && valid) {
              const now = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date());
              if (!rp.startTime) { const start = nextInjectionStart(rp.doseTimes ?? [], now); upd(i, { startDay: rp.startDay || start.day, startTime: start.time }); }
            }
            const next = injEntryStep(current, e.key, route === "点滴静注", valid);
            if (next === "done") decide(i); else focus(i, next);
          }} className="space-y-1.5 py-2">
            <div className="flex items-baseline gap-2">
              <b className="text-ai">Rp{first + i}</b>
              {rp.rows.length === 0 && <span className="text-[11px] text-ink-faint">最初に選んだ薬が主薬。続けて選ぶと混注（輸液を最初に選ぶと「1日◯本」で数えます）</span>}
              {rp.rows.length === 0 && (seed && (rp.startDay !== 0 || rp.startTime)) && (
                <span className="nums text-[11px] text-ai" data-start={`${rp.startDay}|${rp.startTime}`}>
                  開始：{rp.startDay === 0 ? "今日" : rp.startDay === 1 ? "明日" : `${rp.startDay}日後`} {rp.startTime || "時刻なし"}（カレンダーから。薬を選ぶと直せます）
                </span>
              )}
              {rps.length > 1 && (
                <button type="button" tabIndex={-1} onClick={() => setRps((r) => r.filter((_, j) => j !== i))} className="ml-auto text-[11px] text-ink-faint hover:text-shu">
                  この Rp を消す
                </button>
              )}
            </div>
            <table data-step="dose" className="w-full">
              <tbody>
                {rp.rows.map((r, k) => {
                  const m = masterOf(r.drugCode)!;
                  return (
                    <tr key={k} className="align-baseline">
                      <td className="py-0.5">
                        {k > 0 && <span className="mr-1 text-[11px] text-ink-faint">＋</span>}
                        <b>{m.name}</b> <span className="text-xs text-ink-soft">{injectionDrugLabel(m).supplement}</span>
                      </td>
                      <td className="whitespace-nowrap py-0.5 text-right">
                        {rp.step !== "dose" ? <button type="button" onClick={() => focus(i, "dose")}>{r.amount}{r.unit}</button> : <><input
                          value={r.amount}
                          onChange={(e) => upd(i, { rows: rp.rows.map((x, j) => (j === k ? { ...x, amount: e.target.value } : x)) })}
                          onKeyDown={(e) => {
                            if (e.key === "Backspace" && r.amount === "") {
                              e.preventDefault();
                              upd(i, { rows: rp.rows.filter((_, j) => j !== k) });
                            }
                          }}
                          inputMode="decimal"
                          aria-label={`${m.name}の量`}
                          className={`${field} w-14 text-right`}
                        />
                        <select value={r.unit} onChange={(e) => upd(i, { rows: rp.rows.map((x, j) => (j === k ? { ...x, unit: e.target.value } : x)) })} aria-label={`${m.name}の単位`} className={`${field} ml-1`}>
                          {m.units.map((u) => (
                            <option key={u}>{u}</option>
                          ))}
                        </select></>}
                      </td>
                      <td className="w-6 text-right">
                        <button type="button" tabIndex={-1} onClick={() => upd(i, { rows: rp.rows.filter((_, j) => j !== k) })} className="text-ink-faint hover:text-shu" aria-label="外す">
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div data-step="drug" hidden={rp.rows.length > 0 && rp.step !== "drug"} style={{ display: (rp.rows.length > 0 && rp.step !== "drug") ? "none" : undefined }} className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <RpDrugSearch options={options} onEmptyEnter={() => panelRoot.current?.querySelector<HTMLInputElement>(`[data-rp="${i}"] input[inputmode=decimal]`)?.focus()} onBack={() => focus(i, "dose")} onPick={(c) => { upd(i, { rows: [...rp.rows, rowFor(c)], step: "dose" }); requestAnimationFrame(() => { const fields = panelRoot.current?.querySelectorAll<HTMLInputElement>(`[data-rp="${i}"] input[inputmode=decimal]`); fields?.[rp.rows.length]?.focus(); fields?.[rp.rows.length]?.select(); }); }} placeholder={rp.rows.length ? `Rp${first + i} に混注する薬を足す（名前・略称・ひらがな可）` : `Rp${first + i} に薬を入れる（名前・略称・ひらがな可）`} />
              </div>
              {memory && i === memoryAt && <InjMemory memory={memory} onPut={putOrder} />}
            </div>
            {rp.step === "drug" && rp.rows.length > 0 && !isFluidRp(rp) && open.some((t) => t.route === "点滴静注") && !rp.rows.some((r) => masterOf(r.drugCode)?.kind === "輸液") && (
              <select value="" onChange={(e) => e.target.value && upd(i, { rows: [...rp.rows, { ...rowFor(e.target.value), amount: "1", unit: "本" }] })} className={`${field} text-[12px]`} aria-label="溶媒">
                <option value="">＋ 溶媒（輸液）を選ぶ</option>
                {fluids.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.name} {f.package}
                  </option>
                ))}
              </select>
            )}
            {rp.rows.length > 0 && (
              <div className="space-y-1 text-[12px]">
                <button type="button" className="text-ai" onClick={() => focus(i, "drug")}>＋混注</button>
                <DecidedEntryLines lines={injectionEntryLines(rp.step ?? "dose", {
                  route: rp.route === "ロック" ? "静注（ロック）" : route ?? "",
                  schedule: schedules[rp.sched]?.label ?? "",
                  times: rp.doseTimes ?? [],
                  duration: modeOf(rp) === "time" ? minutesLabel(rp.minutes) : `${rp.rate}mL/時`,
                  start: (() => { const t = todayInTokyo(); const d = new Date(Date.UTC(t.y, t.m - 1, t.d + rp.startDay)); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${rp.startTime || "指示受け後すぐ"}から`; })(),
                  days: rp.days ? `${rp.days}日間` : "日数指定なし",
                }, route === "点滴静注")} onEdit={(step) => focus(i, step)} />
                <InjectionEntryRow step="route" active={rp.step} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-16 text-ink-soft">経路</span>
                  <TabChoice
                    numbered label={`Rp${first + i} の経路`}
                    size="lg"
                    options={ROUTE_TABS.map((t) => ({ value: t.key, label: t.lock ? t.key : t.route, disabled: !open.includes(t), title: open.includes(t) ? t.title : `${t.title}：この薬では使えません` }))}
                    value={rp.route || null}
                    onChange={(v) => upd(i, { route: v, minutes: ROUTE_TABS.find((t) => t.key === v)?.route === "点滴静注" ? rp.minutes : 0 })}
                  />
                  {open.length === 0 && <span className="text-shu">同じ経路で使えない薬が混ざっています</span>}
                </InjectionEntryRow>
                <InjectionEntryRow step="schedule" active={rp.step} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-16 text-ink-soft">回数</span>
                  <TabChoice numbered label={`Rp${first + i} の回数`} size="lg" options={schedules.map((x, j) => ({ value: j, label: x.label }))} value={rp.sched >= 0 ? rp.sched : null} onChange={(v) => upd(i, { sched: v })} />
                </InjectionEntryRow>
                {route === "点滴静注" && (
                  <InjectionEntryRow step="duration" active={rp.step}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="w-16 text-ink-soft">落とし方</span>
                      <TabChoice
                        label={`Rp${first + i} の落とし方`}
                        size="lg"
                        options={[
                          { value: "time", label: "時間で" },
                          { value: "rate", label: "速度で（mL/時）" },
                        ]}
                        value={modeOf(rp)}
                        onChange={(v) => upd(i, { rateMode: v as "time" | "rate" })}
                      />
                    </div>
                    {modeOf(rp) === "time" ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="w-16 text-ink-soft">1回の時間</span>
                        <input key={`${i}-duration`} list={`${uid}-minutes`} defaultValue={rp.minutes ? minutesLabel(rp.minutes) : ""} aria-label={`Rp${first + i} の1回の時間`} placeholder="分 または 1時間30分" onChange={(e) => upd(i, { minutes: parseDuration(e.target.value) ?? 0 })} className={field} /><datalist id={`${uid}-minutes`}>{DRIP_MINUTES.map((m) => <option key={m} value={minutesLabel(m)} />)}</datalist>
                        <DripCalc rp={rp} /><span className="hint">{ONCE_INFUSION_HINT}</span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="w-16 text-ink-soft">速度</span>
                        <input value={rp.rate} onChange={(e) => upd(i, { rate: e.target.value })} inputMode="decimal" aria-label={`Rp${first + i} の速度（mL/時）`} className={`${field} w-16 text-right`} />
                        mL/時
                        <TabChoice label={`Rp${first + i} のよく使う速度`} options={DRIP_RATES.map((r) => ({ value: r, label: String(r) }))} value={Number(rp.rate) || null} onChange={(v) => upd(i, { rate: String(v) })} />
                        <DripCalc rp={rp} /><span className="hint">{ONCE_INFUSION_HINT}</span>
                      </div>
                    )}
                  </InjectionEntryRow>
                )}
                <InjectionEntryRow step="start" active={rp.step} className="flex flex-wrap items-center gap-1.5">
                  <label htmlFor={`${uid}-${i}-start`} className="w-16 text-ink-soft">
                    開始
                  </label>
                  <button type="button" aria-pressed={!!rp.startNow} className={`rounded border px-2 py-1 ${rp.startNow ? "border-ai bg-ai text-white" : "border-rule text-ink-soft"}`} onClick={() => { const now = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date()); upd(i, { startDay: 0, startTime: now, doseTimes: schedulesOf(rp)[rp.sched]?.value.kind === "once" ? [now] : rp.doseTimes, startNow: true }); }}>今すぐ</button>
                  <TabChoice
                    label={`Rp${first + i} の開始日`}
                    size="lg"
                    options={[
                      { value: 0, label: "今日" },
                      { value: 1, label: "明日" },
                      // A later day chosen on the calendar stays as a third choice.
                      ...(rp.startDay > 1 ? [{ value: rp.startDay, label: `${rp.startDay}日後` }] : []),
                    ]}
                    value={rp.startDay}
                    onChange={(v) => upd(i, { startDay: v })}
                  />
                  <input id={`${uid}-${i}-start`} type="time" value={rp.startTime} onChange={(e) => upd(i, { startTime: e.target.value })} className={`${field} min-h-[30px]`} aria-label={`Rp${first + i} の開始時刻`} />
                  <span className="hint text-[11px] text-ink-faint">空なら指示受け後すぐ</span>
                </InjectionEntryRow>
                <InjectionEntryRow step="days" active={rp.step} className="flex flex-wrap items-center gap-1.5">
                  <label htmlFor={`${uid}-${i}-days`} className="w-16 text-ink-soft">
                    日数
                  </label>
                  <input id={`${uid}-${i}-days`} value={rp.days} onChange={(e) => upd(i, { days: e.target.value })} inputMode="numeric" placeholder="—" aria-label={`Rp${first + i} の日数`} className={`${field} min-h-[30px] w-14 text-right`} />
                  <span>日間</span>
                  <span className="hint text-[11px] text-ink-faint">空なら日数を決めません（1回だけ、または止めるまで）</span>
                </InjectionEntryRow>
                <InjectionEntryRow step="times" active={rp.step}>
                <DoseTimesEntry label={`Rp${first + i} の投与時刻`} times={rp.doseTimes ?? []} onChange={(doseTimes) => upd(i, { doseTimes })} />
                </InjectionEntryRow>
                <p className="hint">投与時刻は架空の病院の取り決めです。1回ずつ書き替え、＋時刻・×で追加・削除できます。24:00 は翌日0時です。</p>
                <InjectionEntryRow step="start" active={rp.step}>
                <label className="block">開始日付 <input type="date" aria-label={`Rp${first + i} の開始日付`} value={(() => { const t = todayInTokyo(); return new Date(Date.UTC(t.y, t.m - 1, t.d + rp.startDay)).toISOString().slice(0, 10); })()} onChange={(e) => { const t = todayInTokyo(); if (e.target.value) upd(i, { startDay: Math.round((Date.parse(e.target.value) - Date.UTC(t.y, t.m - 1, t.d)) / 86400000) }); }} className={field} /></label>
                <label className="block">開始日（今日からの日数） <input type="number" value={rp.startDay} onChange={(e) => upd(i, { startDay: Number(e.target.value) })} className={`${field} w-16`} /></label>
                </InjectionEntryRow>
                <InjectionEntryRow step="days" active={rp.step}>
                <label className="block">終了 <input aria-label={`Rp${first + i} の終了日`} type="number" placeholder="今日からの日数" value={rp.endDay ?? ""} onChange={(e) => upd(i, { endDay: e.target.value ? Number(e.target.value) : undefined })} className={`${field} w-16`} /> <input type="time" aria-label={`Rp${first + i} の終了時刻`} value={rp.endTime ?? ""} onChange={(e) => upd(i, { endTime: e.target.value })} className={field} /></label>
                {!rp.endTime && autoEnd && <p className="text-xs">最終投与の終了予定：{autoEnd.day === 0 ? "今日" : `${autoEnd.day}日後`} {autoEnd.time}（量と時間から計算）</p>}
                {validateInjectionEnd(rp.startDay, rp.startTime, Number(rp.days), rp.endDay, rp.endTime, rp.minutes, rp.doseTimes).map((m) => <p key={m} className="text-shu">{m}</p>)}
                </InjectionEntryRow>
                <label><input type="checkbox" checked={!!rp.alreadyDone} onChange={(e) => upd(i, { alreadyDone: e.target.checked })} /> 実施済み</label>
                <div className="flex items-center gap-1.5">
                  <label htmlFor={`${uid}-${i}-comment`} className="w-16 shrink-0 text-ink-soft">
                    コメント
                  </label>
                  <input
                    id={`${uid}-${i}-comment`}
                    value={rp.comment}
                    onChange={(e) => upd(i, { comment: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing && !e.metaKey && !e.ctrlKey && complete(rp)) {
                        e.preventDefault();
                        decide(i);
                      }
                    }}
                    placeholder="任意"
                    aria-label={`Rp${first + i} のコメント`}
                    className={`${field} min-h-[30px] min-w-0 flex-1`}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    disabled={!complete(rp)}
                    onClick={() => decide(i)}
                    title={complete(rp) ? "選んだ結果だけを1行で出し、次の Rp へ進みます（あとで直せます）" : decideHint(missingOf(rp))}
                    className="min-h-[30px] rounded-md border border-ai/50 px-3 py-1 text-[12px] font-bold text-ai hover:bg-ai-soft disabled:border-rule disabled:font-normal disabled:text-ink-faint pointer-coarse:py-2"
                  >
                    Rp{first + i} を決める
                  </button>
                  {/* Why the button is off, on the screen (not only in the tooltip): the missing things in order. */}
                  {complete(rp) ? <span className="hint text-[11px] text-ink-faint">コメントの欄で Enter でも決められます</span> : <span className="text-[12px] text-yamabuki">{decideHint(missingOf(rp))}</span>}
                </div>
              </div>
            )}
          </section>
        );
      })}
      </LineEntry>
      <div className="sticky bottom-0 flex gap-2 border-t border-rule bg-sheet pt-3">
        <button type="button" onClick={() => setRps((r) => [...r, freshRp()])} className="rounded-md border border-rule px-3 py-2 text-sm text-ink-soft">
          Rp を足す
        </button>
        <button
          type="button"
          disabled={!ready.length}
          title={unfinished.length ? unfinished.map((x) => `Rp${first + x.i}：${x.miss.join("・")}が未選択`).join("／") : "⌘Enter（Ctrl+Enter）でも押せます"}
          onClick={submit}
          className="flex-1 rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          下書きにする（{ready.length} Rp）<kbd className="ml-2 rounded border border-white/40 px-1 text-[10px] font-normal">⌘↵</kbd>
        </button>
      </div>
      {unfinished.length > 0 && <p className="text-[12px] text-yamabuki">{unfinished.map((x) => `Rp${first + x.i}：${x.miss.join("・")}が未選択`).join("　")}</p>}
      <p className="hint text-[11px] text-ink-faint">点滴の速度（mL/時）は量と時間からコードで計算し、下書きに式を出します。経路・重複・時刻の確認も下書きに出ます。</p>
    </div>
  );
}

/** An order as an Rp to change (修正): same drugs, route, frequency and drip time; it starts today. */
function rpFromOrder(o: InjectionOrder): InjRp {
  const rows = o.items.map((it) => ({ drugCode: it.drugCode, amount: String(it.amount), unit: it.unit }));
  const lock = !!o.comment?.startsWith("ロック");
  const tab = ROUTE_TABS.find((t) => t.route === o.route && !!t.lock === lock) ?? ROUTE_TABS.find((t) => t.route === o.route);
  const rp: InjRp = { ...newInjRp(), step: "dose", rows, route: tab?.key ?? "" };
  const same = (a: InjectionSchedule, b: InjectionSchedule) => a.kind === b.kind && (a.kind !== "per_day" || (b.kind === "per_day" && a.count === b.count)) && (a.kind !== "every_hours" || (b.kind === "every_hours" && a.hours === b.hours));
  rp.sched = schedulesOf(rp).findIndex((x) => same(x.value, o.schedule));
  rp.minutes = o.minutesPerDose ?? 0;
  rp.doseTimes = o.doseTimes ?? defaultDoseTimes(o.schedule);
  rp.endDay = o.end?.day;
  rp.endTime = o.end?.time;
  // A drip given by rate (or with a time not among the choices) is copied by its rate.
  if (o.route === "点滴静注" && o.rateMlPerH && !rp.minutes) {
    rp.rateMode = "rate";
    rp.rate = String(o.rateMlPerH);
  }
  const left = o.days ? o.start.day + o.days : 0;
  rp.days = left > 0 ? String(left) : "";
  rp.comment = (lock ? o.comment!.replace(/^ロック\s*/, "") : (o.comment ?? "")).trim();
  return rp;
}

/**
 * What the calendar handed over as an Rp: 修正 (the order, starting today with the days left), Do (the order
 * with its own 日数, from the start given) or a new injection (only the start: day and time band; the drug is chosen next).
 */
function rpFromSeed(seed: InjSeed): InjRp {
  const rp = seed.order ? rpFromOrder(seed.order) : newInjRp();
  if (!seed.start) return rp;
  return { ...rp, startNow: false, startDay: seed.start.day, startTime: seed.start.time ?? "", days: seed.order?.days ? String(seed.order.days) : rp.days };
}

/** How the drip is given: as chosen, else by rate for a bag (fluid first) and by time for a drug. */
const modeOf = (rp: InjRp): "time" | "rate" => rp.rateMode ?? (isFluidRp(rp) && schedulesOf(rp)[rp.sched]?.value.kind !== "once" ? "rate" : "time");

/** The other half, worked out by code: the rate from the time, or the time per bag from the rate. */
function DripCalc({ rp }: { rp: InjRp }) {
  const vol = doseVolumeMl(rp.rows.map((r) => ({ drugCode: r.drugCode, amount: Number(r.amount) || null, unit: r.unit })));
  if (!vol) return null;
  const mode = modeOf(rp);
  const rate = Number(rp.rate);
  const text =
    mode === "time"
      ? rp.minutes
        ? `${vol}mL ÷ ${minutesLabel(rp.minutes)} = ${Math.round((vol / (rp.minutes / 60)) * 10) / 10}mL/時`
        : null
      : rate > 0
        ? `1回 ${vol}mL ÷ ${rate}mL/時 = ${minutesLabel(Math.round((vol / rate) * 60))}`
        : null;
  return text ? <span className="nums text-[11px] text-ai">{text}<span className="hint">（コードで計算）</span></span> : null;
}

/** A decided Rp as one line: only what was chosen (drugs, route, frequency, drip, start, days, comment). */
function RpSummary({ rp }: { rp: InjRp }) {
  const drugs = rp.rows.map((r) => {
    const m = masterOf(r.drugCode)!;
    return `${m.name}（${m.package}）${r.amount}${r.unit}`;
  });
  const drip = routeOf(rp) === "点滴静注" ? (modeOf(rp) === "time" ? `1回${minutesLabel(rp.minutes)}` : `${rp.rate}mL/時`) : null;
  const t = todayInTokyo();
  const date = new Date(Date.UTC(t.y, t.m - 1, t.d + rp.startDay));
  const start = `${date.getUTCMonth() + 1}/${date.getUTCDate()}${rp.startTime ? ` ${rp.startTime}` : ""}から`;
  const parts = [routeOf(rp), schedulesOf(rp)[rp.sched]?.label, rp.doseTimes?.join("・"), drip, start, rp.endTime ? `終了 ${rp.endDay ?? rp.startDay}日後 ${rp.endTime}` : null, rp.alreadyDone ? "実施済み" : null, schedulesOf(rp)[rp.sched]?.value.kind !== "once" && Number(rp.days) > 0 ? `${rp.days}日間` : null, rp.comment.trim() || null].filter(Boolean);
  return (
    <>
      <b>{drugs.join(" ＋ ")}</b>
      <span className="text-ink-soft">　{parts.join("　")}</span>
      {drip && (
        <span className="ml-1">
          {"　"}<DripCalc rp={rp} /><span className="hint">{ONCE_INFUSION_HINT}</span>
        </span>
      )}
    </>
  );
}

// The first drug picked is the main one (as on a slip): a fluid first means a bag with drugs mixed in,
// counted in bags (1日2本); a drug first means doses of that drug (8時間ごと), with any solvent after it.
const isFluidRp = (rp: InjRp) => rp.rows.length > 0 && masterOf(rp.rows[0].drugCode)?.kind === "輸液";
const schedulesOf = (rp: InjRp) => (isFluidRp(rp) ? FLUID_SCHEDULES : SCHEDULES);

// The lab order screen lives in its own file (tabs, draw time, points); re-exported for the callers.
export { AddLabPanel } from "./AddLabPanel";

/**
 * Pick a procedure from the master. It becomes a draft right away; the checks ask for what the
 * item needs (器具・流量、部位・範囲・深さ、回数), each with choices for the doctor.
 */
export function AddProcedurePanel({ onAdd, newId }: { onAdd: (d: Draft) => void; newId: () => string }) {
  // マスタ管理: 採用 and not 中止, in 表示順, with the 院内名.
  const ml = useMasterLocal();
  return (
    <div>
      <p className="hint mb-2 text-xs text-ink-soft">選ぶと右に下書きができます。足りないところ（流量・部位・範囲・回数など）は下書きの上で選ぶか、話して足してください。</p>
      <ul className="divide-y divide-rule-soft">
        {pickable("処置", PROCEDURES, ml).map((p) => (
          <li key={p.code}>
            <button type="button" onClick={() => onAdd(newProcedureDraft(p.code, newId()))} className="flex w-full items-baseline gap-2 px-1 py-2 text-left text-sm hover:bg-paper">
              <span className="font-bold">{nameIn(ml, "処置", p.code, p.name)}</span>
              {p.uses && <span className="text-xs text-ink-soft">{findProcDrug(p.uses.code)?.name}</span>}
              <span className="ml-auto truncate text-[11px] text-ink-faint">{p.aliases.slice(0, 3).join("・")}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="hint mt-3 text-[11px] text-ink-faint">処置の項目と院内の取り決めは架空の病院のものです。算定のコードと点数は公式の医科診療行為マスターから読みます。</p>
    </div>
  );
}

interface RpRow {
  drugCode: string;
  /** 1回量, in the drug's unit. */
  per: string;
}
interface Rp {
  rows: RpRow[];
  /** 1日の回数 (1〜4), or "頓用"; null until chosen. */
  times: number | "頓用" | null;
  /** The timing label for that number of times (毎食後, 朝夕食後 …). */
  timing: string;
  days: string;
  category: "定期" | "臨時" | "退院時";
  prn: string;
  maxPerDay: string;
  onePack?: boolean;
  alreadyDone?: boolean;
  comment?: string;
  step?: RxStep;
}
const newRp = (): Rp => ({ rows: [], times: null, timing: "", days: "7", category: "定期", prn: "", maxPerDay: "" });
const TIMES: { value: number | "頓用"; label: string }[] = [
  { value: 1, label: "1日1回" },
  { value: 2, label: "1日2回" },
  { value: 3, label: "1日3回" },
  { value: 4, label: "1日4回" },
  { value: "頓用", label: "頓用" },
];

/**
 * Oral drugs by Rp, written as 1回量・1日◯回・用法（例：1回1錠　1日3回　毎食後）. Search the master
 * inside each Rp (前方一致 / 部分一致); the 1日量 is worked out by code and shown. Each Rp becomes a
 * draft and goes through the same checks (errors / warnings to 承知).
 */
/** A remembered Rp (処方の記憶 or Do) as an Rp to change before drafting. */
const rpFromPattern = (p: Pick<RxPattern, "rows" | "times" | "timing" | "days" | "category" | "prn" | "maxPerDay">): Rp => ({
  rows: p.rows.map((r) => ({ drugCode: r.drugCode, per: String(r.per) })),
  times: p.times,
  timing: p.timing,
  days: p.days ? String(p.days) : "",
  category: p.category,
  prn: p.prn ?? "",
  maxPerDay: p.maxPerDay ? String(p.maxPerDay) : "",
});

export function AddRxPanel({
  onAdd,
  newId,
  drafts = [],
  seed,
  memory,
  ward = "",
}: {
  ward?: string;
  onAdd: (d: Draft[]) => void;
  newId: () => string;
  drafts?: Draft[];
  /** Do: a past prescription to copy in. */
  seed?: { key: string; pattern: RxPattern };
  /** 処方の記憶: the doctor's patterns, this patient's previous prescriptions, and who is writing. */
  memory?: { patterns: RxPattern[]; previous: RxPattern[]; me: string };
}) {
  const first = drafts.filter((d) => d.kind === "prescription").length + 1;
  const [rps, setRps] = useState<Rp[]>([newRp()]);
  const [category, setCategory] = useState<Rp["category"]>("定期");
  const tokyo = todayInTokyo();
  const today = new Date(tokyo.y, tokyo.m - 1, tokyo.d);
  const nextDay = nextRegularDay(ward, today);
  // Put a remembered Rp into the first empty Rp (or a new one).
  const putIn = (ps: Rp[]) => {
    if (ps[0]) setCategory(ps[0].category);
    return setRps((r) => {
      const out = [...r];
      for (const x of ps) {
        const i = out.findIndex((y) => y.rows.length === 0);
        if (i < 0) out.push(x);
        else out[i] = x;
      }
      return out.some((y) => y.rows.length === 0) ? out : [...out, newRp()];
    });
  };
  const [seeded, setSeeded] = useState<string | null>(null);
  if (seed && seed.key !== seeded) {
    setSeeded(seed.key);
    putIn([rpFromPattern(seed.pattern)]);
  }
  // マスタ管理: 採用 and not 中止, in 表示順, with the 院内名.
  const ml = useMasterLocal();
  const options = pickable("内服薬", ORAL_DRUGS, ml).map((d) => ({ code: d.code, name: nameIn(ml, "内服薬", d.code, d.name), sub: nameIn(ml, "内服薬", d.code, "") ? `${d.name} ${d.strength}／${d.unit}` : `${d.strength}／${d.unit}`, aliases: [d.name, ...d.aliases] }));
  const upd = (i: number, patch: Partial<Rp>) =>
    setRps((r) =>
      r.map((x, j) => {
        if (j !== i) return x;
        const next = { ...x, ...patch };
        // The timing must fit the number of times; choose it when there is only one (1日3回 → 毎食後).
        const choices = typeof next.times === "number" ? TIMINGS_BY_TIMES[next.times] : [];
        if (next.timing && !choices.some((c) => c.label === next.timing)) next.timing = "";
        if (!next.timing && choices.length === 1) next.timing = choices[0].label;
        return next;
      }),
    );
  const timingsOf = (rp: Rp) => (rp.times === "頓用" ? [] : typeof rp.times === "number" ? (TIMINGS_BY_TIMES[rp.times].find((c) => c.label === rp.timing)?.timings ?? null) : null);
  const missingOf = (rp: Rp) => {
    const prn = rp.times === "頓用";
    return [
      ...(rp.rows.every((r) => validDose(r.per, findOralDrug(r.drugCode)!)) ? [] : ["1回量"]),
      ...(rp.times === null ? ["回数"] : []),
      ...(!prn && rp.times !== null && !rp.timing ? ["用法"] : []),
      ...(prn && !rp.prn.trim() ? ["頓用の条件"] : []),
      ...(!prn && !(Number(rp.days) > 0) ? ["日数"] : []),
    ];
  };
  const filled = rps.filter((r) => r.rows.length > 0);
  const unfinished = rps.map((r, i) => ({ i, miss: r.rows.length ? missingOf(r) : [] })).filter((x) => x.miss.length);
  const ready = unfinished.length ? [] : filled;

  const toDraft = (rp: Rp): Draft => {
    const prn = rp.times === "頓用";
    return {
      id: newId(),
      origin: "manual",
      sourceText: ["（Rp 入力）", rp.comment, rp.onePack ? "一包化" : null].filter(Boolean).join("　"),
      comment: rp.comment?.trim() || null,
      onePack: !!rp.onePack,
      alreadyDone: rp.alreadyDone,
      kind: "prescription",
      category,
      items: rp.rows.map((r) => ({ drugCode: r.drugCode, said: findOralDrug(r.drugCode)?.name ?? r.drugCode, daily: null, perDose: Number(r.per) || null })),
      timings: timingsOf(rp),
      prn: prn ? rp.prn.trim() || null : null,
      maxPerDay: prn ? Number(rp.maxPerDay) || null : null,
      days: prn ? null : Number(rp.days) || null,
      start: category === "定期" && !prn && nextDay
        ? { day: regularDayOffset(ward, today), timing: timingsOf(rp)?.[0] ?? null }
        : { day: null, timing: null },
      acks: [],
    };
  };
  const submit = () => {
    if (!ready.length) return;
    const trailing = rps.filter((r) => !r.rows.length).map((r) => r.comment?.trim()).filter(Boolean).join("　");
    onAdd(ready.map((rp, i) => toDraft(i === ready.length - 1 && trailing ? { ...rp, comment: [rp.comment, trailing].filter(Boolean).join("　") } : rp)));
    setRps([{ ...newRp(), days: category === "臨時" ? "3" : "7" }]);
  };
  const { root: panelRoot, onKeyDown: panelKeys } = usePanelKeys(submit);
  const field = "rounded border border-rule bg-paper px-1 py-0.5 outline-none focus:border-ai";
  const focus = (i: number, step: RxStep) => {
    upd(i, { step });
    requestAnimationFrame(() => panelRoot.current?.querySelector<HTMLElement>(`[data-rp="${i}"] [data-step="${step}"] input, [data-rp="${i}"] [data-step="${step}"] select, [data-rp="${i}"] [data-step="${step}"] button`)?.focus());
  };
  const decide = (i: number) => {
    if (missingOf(rps[i]).length) return;
    upd(i, { step: "done" });
    const next = rps.findIndex((r, j) => j > i && !r.rows.length);
    if (next < 0) setRps((r) => [...r, { ...newRp(), days: category === "臨時" ? "3" : "7" }]);
    requestAnimationFrame(() => panelRoot.current?.querySelector<HTMLInputElement>(`[data-rp="${next < 0 ? rps.length : next}"] input[role=combobox]`)?.focus());
  };
  return (
    <div ref={panelRoot} onKeyDown={panelKeys} className="space-y-2 text-[13px]">
      <CollectedRps drafts={drafts} kind="prescription" />
      <TabChoice label="処方全体の区分" options={["定期", "臨時", "退院時"].map((v) => ({ value: v, label: v }))} value={category} onChange={(v) => { setCategory(v as Rp["category"]); setRps((rs) => rs.map((r) => ({ ...r, days: v === "臨時" ? "3" : "7" }))); }} />
      {category === "定期" && <p className="text-xs">{nextDay ? `この病棟の定期処方日：${"日月火水木金土"[REGULAR_RX_DAYS[ward.replace(/病棟$/, "")]]}曜。次は ${nextDay.getMonth() + 1}/${nextDay.getDate()}（${"日月火水木金土"[nextDay.getDay()]}）から` : "この病棟の定期処方日は未設定です。"}</p>}
      <p className="hint text-xs"><a href={ORAL_MASTER_SOURCE.url} target="_blank" rel="noreferrer" className="text-ai underline">{ORAL_MASTER_SOURCE.label}</a>。品目ごとの出典は院内医薬品集で確認できます。</p>
      <p className="hint text-xs">定期処方日は架空の病院の取り決めです。薬名 → 1回量 → 回数 → 用法 → 日数を Enter または Tab、Esc で前の欄へ。数字・矢印で候補を選べます。「＋コメント」または薬名欄の ; でコメント行を入れます。</p>
      <LineEntry>
      {rps.map((rp, i) => {
        const step = rp.step ?? (rp.rows.length ? "dose" : "drug");
        const label = `Rp${first + i}`;
        const prn = rp.times === "頓用";
        const choices = typeof rp.times === "number" ? TIMINGS_BY_TIMES[rp.times] : [];
        const summary = rp.rows.map((r) => { const m = findOralDrug(r.drugCode)!; return `${m.name} ${m.strength}　1回${r.per}${m.unit}`; }).join(" ＋ ");
        const advance = (e: React.KeyboardEvent, current: RxStep, valid = true) => {
          if (e.nativeEvent.isComposing || e.metaKey || e.ctrlKey || e.shiftKey) return;
          if (!["Enter", "Tab", "Escape", "ArrowUp"].includes(e.key)) return;
          e.preventDefault(); e.stopPropagation();
          if (e.key === "ArrowUp") { focus(i, rxEntryStep(current, e.key)); return; }
          if (current === "usage" && prn) {
            const condition = (e.target as HTMLElement).getAttribute("aria-label") === `${label} の頓用の条件`;
            if (condition && e.key !== "Escape" && rp.prn.trim()) {
              panelRoot.current?.querySelector<HTMLInputElement>(`[data-rp="${i}"] input[aria-label="${label} の1日の上限回数"]`)?.focus(); return;
            }
          }
          if (current === "times" && rp.times === null && e.key !== "Escape") { upd(i, { times: 1 }); focus(i, "usage"); return; }
          if (current === "usage" && !prn && !rp.timing && e.key !== "Escape") { upd(i, { timing: choices[0].label }); focus(i, "days"); return; }
          if (current === "days" && e.key !== "Escape") { decide(i); return; }
          focus(i, rxEntryStep(current, e.key, valid));
        };
        const drugSearch = <RpDrugSearch options={options} onEmptyEnter={() => rp.rows.length ? focus(i, "dose") : submit()} onBack={() => i > 0 ? focus(i - 1, "dose") : undefined} onComment={(text) => { upd(i, { comment: text }); requestAnimationFrame(() => panelRoot.current?.querySelector<HTMLInputElement>(`[data-rp="${i}"] [data-comment]`)?.focus()); }} onPick={(c) => { upd(i, { rows: [...rp.rows, { drugCode: c, per: "" }], step: "dose" }); requestAnimationFrame(() => { const fields = panelRoot.current?.querySelectorAll<HTMLInputElement>(`[data-rp="${i}"] [data-step=dose] input`); fields?.[fields.length - 1]?.focus(); }); }} placeholder={`${label} に薬を入れる（名前・略称・ひらがな可）`} />;
        return <section key={i} data-rp={i} className="py-2">
          {rp.comment !== undefined && <div className="border-b border-rule py-1"><input data-comment aria-label={`${label} のコメント`} className="w-full bg-transparent outline-none" placeholder="フリーコメント" value={rp.comment} onChange={(e) => upd(i, { comment: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); focus(i, "drug"); } }} /></div>}
          {step === "done" ? <button className="w-full py-1 text-left" onClick={() => focus(i, "dose")}><b>{label}</b>　{summary}　{howText(timingsOf(rp), rp.prn, Number(rp.maxPerDay) || null)}　{rp.days}日分{rp.onePack ? "　一包化" : ""}{rp.alreadyDone ? "　実施済み" : ""}</button> : <>
          <div className="flex items-baseline gap-2">{!rp.rows.length && <><b>{label}</b><div data-step="drug" className="min-w-0 flex-1">{drugSearch}</div></>}<button type="button" aria-label={`${label} を消す`} className="ml-auto text-xs text-ink-faint" onClick={() => setRps((rs) => rs.length === 1 ? [newRp()] : rs.filter((_, j) => j !== i))}>×</button><button type="button" className="text-xs text-ink-soft" onClick={() => { upd(i, { comment: rp.comment ?? "" }); requestAnimationFrame(() => panelRoot.current?.querySelector<HTMLInputElement>(`[data-rp="${i}"] [data-comment]`)?.focus()); }}>＋コメント</button></div>
          {rp.rows.map((r, k) => { const m = findOralDrug(r.drugCode)!; return <div key={k} data-step="dose" className="flex items-center justify-between border-b border-rule-soft py-1" onKeyDown={(e) => { if ((e.target as HTMLElement).tagName === "INPUT") advance(e, "dose", validDose(r.per, m)); }}>
            <span>{k === 0 && <b className="mr-2">{label}</b>}{m.name} {m.strength}</span>{step !== "dose" ? <button type="button" onClick={() => focus(i, "dose")}>1回 {r.per}{m.unit}</button> : <label>1回 <input onKeyDown={(e) => { if (e.key === "Backspace" && !r.per) { e.preventDefault(); const rows = rp.rows.filter((_, j) => j !== k); upd(i, { rows, step: rows.length ? "dose" : "drug" }); } }} aria-label={`${m.name}の1回量`} className={`${field} w-14`} inputMode="decimal" value={r.per} onChange={(e) => upd(i, { rows: rp.rows.map((x, j) => j === k ? { ...x, per: e.target.value } : x) })} /> {m.unit}</label>}<button type="button" aria-label={`${m.name}を外す`} onClick={() => { const rows = rp.rows.filter((_, j) => j !== k); upd(i, { rows, step: rows.length ? "dose" : "drug" }); }}>×</button>
          </div>; })}
          <div data-step="drug">
            {rp.rows.length > 0 && step === "drug" && drugSearch}
          </div>
          {memory && !rp.rows.length && <RxMemory memory={memory} rps={rps} onPut={(ps) => putIn(ps.map(rpFromPattern))} newId={newId} />}
          {rp.rows.length > 0 && <>
            <button type="button" className="text-xs text-ai" onClick={() => focus(i, "drug")}>＋同じ飲み方の薬</button>
            <DecidedEntryLines lines={rxEntryLines(step, { times: rp.times === "頓用" ? "頓用" : rp.times ? `1日${rp.times}回` : "", usage: prn ? `${rp.prn}${rp.maxPerDay ? ` 1日${rp.maxPerDay}回まで` : ""}` : rp.timing, days: `${rp.days}日分` })} onEdit={(s) => focus(i, s)} />
            {["times", "usage", "days"].includes(step) && <div className="border-b border-rule py-2" data-step={step} onKeyDown={(e) => advance(e, step, step === "times" ? rp.times !== null : step === "usage" ? prn ? !!rp.prn.trim() : !!rp.timing : Number(rp.days) > 0)}>
              {step === "times" && <TabChoice numbered autoFocus label={`${label} の回数`} options={TIMES} value={rp.times} onChange={(v) => upd(i, { times: v })} />}
              {step === "usage" && (prn ? <><input autoFocus aria-label={`${label} の頓用の条件`} placeholder="疼痛時など" value={rp.prn} onChange={(e) => upd(i, { prn: e.target.value })} /><label>1日 <input className="w-10" aria-label={`${label} の1日の上限回数`} value={rp.maxPerDay} onChange={(e) => upd(i, { maxPerDay: e.target.value })} />回まで</label></> : <TabChoice numbered autoFocus label={`${label} の用法`} options={choices.map((c) => ({ value: c.label, label: c.label }))} value={rp.timing} onChange={(v) => upd(i, { timing: v })} />)}
              {step === "days" && <label>日数 <input autoFocus aria-label={`${label} の日数`} inputMode="numeric" className={`${field} w-14`} value={rp.days} onChange={(e) => upd(i, { days: e.target.value })} /> 日分</label>}
            </div>}
            {step !== "days" && step !== "drug" && <button type="button" className="ml-2 rounded border border-rule px-2 text-xs" onClick={() => {
              if (step === "dose" && rp.rows.every((r) => validDose(r.per, findOralDrug(r.drugCode)!))) focus(i, "times");
              if (step === "times" && rp.times !== null) focus(i, "usage");
              if (step === "usage" && (prn ? !!rp.prn.trim() : !!rp.timing)) focus(i, "days");
            }}>次へ</button>}
            <label className="ml-2 text-xs"><input type="checkbox" checked={!!rp.alreadyDone} onChange={(e) => upd(i, { alreadyDone: e.target.checked })} /> 実施済み</label>
            <label className="ml-2 text-xs"><input type="checkbox" checked={!!rp.onePack} onChange={(e) => upd(i, { onePack: e.target.checked })} /> 一包化</label>
            <button type="button" className="ml-2 text-xs text-ai" disabled={!!missingOf(rp).length} onClick={() => decide(i)}>{label} を決める</button>
            {rp.rows.some((r) => r.per !== "" && !validDose(r.per, findOralDrug(r.drugCode)!)) && <p className="text-xs text-shu">1回量の刻みを確認してください。</p>}
          </>}
          </>}
        </section>;
      })}
      </LineEntry>
      <button type="button" disabled={!ready.length} onClick={submit} className="w-full rounded bg-ai p-2 font-bold text-white disabled:opacity-40">決める・下書きにする（{ready.length} Rp）</button>
    </div>
  );
}

// The imaging order screen lives in its own file (部位の区分・検索, 左右・体位・方向, CT・MRI の方法と造影, 同意); re-exported for the callers.
export { AddImagingPanel } from "./AddImagingPanel";

/** Physiological tests: pick the test and say why; place, date and transport are asked on the draft. */
export function AddPhysioPanel({ onAdd, newId }: { onAdd: (d: Draft) => void; newId: () => string }) {
  const [test, setTest] = useState<string | null>(null);
  const [purpose, setPurpose] = useState("");
  return (
    <div className="space-y-3 text-[13px]">
      <ul className="divide-y divide-rule-soft rounded border border-rule-soft">
        {PHYSIO.map((p) => (
          <li key={p.code}>
            <button type="button" onClick={() => setTest(p.code)} className={`flex w-full items-baseline gap-2 px-2 py-2 text-left ${test === p.code ? "bg-ai-soft font-bold text-ai" : "hover:bg-paper"}`}>
              {p.name}
              <span className="ml-auto text-[11px] font-normal text-ink-faint">{p.bedside ? "ベッドサイド可" : "検査室"}</span>
            </button>
          </li>
        ))}
      </ul>
      <label className="flex flex-col gap-1 text-xs text-ink-soft">
        目的
        <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="例：心機能評価" className="rounded-md border border-rule bg-paper px-2 py-1.5 text-[13px] text-ink outline-none focus:border-ai" />
      </label>
      <button
        type="button"
        disabled={!test}
        onClick={() => onAdd({ ...emptyPhysio(newId(), test), purpose: purpose.trim() || null })}
        className="w-full rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
      >
        下書きにする
      </button>
    </div>
  );
}

/**
 * 透析指示: the conditions of a hemodialysis on the ward, chosen item by item (nothing preselected).
 * The ultrafiltration rate is worked out in code from the amount, the time and the chart's weight, and
 * set against the guideline's mark. It becomes a 処置 draft (血液透析) checked like any other.
 */
export function AddDialysisPanel({ onAdd, newId, weightKg }: { onAdd: (d: Draft) => void; newId: () => string; weightKg?: number }) {
  const master = findProc("PROC-HD")!;
  const [f, setF] = useState({
    purpose: null as HdOrder["purpose"] | null,
    method: null as HdOrder["method"] | null,
    startDay: 0,
    startTime: "",
    sched: null as number | null,
    days: "",
    minutes: null as number | null,
    qb: null as number | null,
    membrane: null as number | null,
    drug: null as HdOrder["anticoag"]["drug"] | null,
    initial: "",
    hourly: "",
    uf: "",
    dw: "",
    access: null as string | null,
    comment: "",
  });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const ac = f.drug ? HD_ANTICOAG[f.drug] : null;
  const missing = [
    !f.purpose && "区分",
    !f.method && "方法",
    f.sched === null && "回数",
    !f.minutes && "時間",
    !f.qb && "血流量",
    !f.membrane && "膜面積",
    !f.drug && "抗凝固薬",
    !!ac?.initial && f.initial.trim() === "" && "初回量",
    !!ac?.hourly && f.hourly.trim() === "" && "持続量",
    f.uf.trim() === "" && "除水量",
    !f.access && "アクセス",
  ].filter((x): x is string => !!x);
  const uf = Number(f.uf);
  const rate = f.minutes && uf > 0 && weightKg ? hdUfRate(uf, f.minutes, weightKg) : null;
  const submit = () => {
    if (missing.length) return;
    const hd: HdOrder = {
      purpose: f.purpose!,
      method: f.method!,
      minutes: f.minutes!,
      qb: f.qb!,
      membrane: f.membrane!,
      anticoag: { drug: f.drug!, initial: ac?.initial ? Number(f.initial) : null, hourly: ac?.hourly ? Number(f.hourly) : null },
      uf,
      dw: f.dw.trim() ? Number(f.dw) : null,
      access: f.access!,
    };
    onAdd({
      ...newProcedureDraft("PROC-HD", newId()),
      sourceText: "（透析の欄から）",
      hd,
      schedule: master.schedules[f.sched!],
      start: { day: f.startDay, time: f.startTime || null },
      days: Number(f.days) > 0 ? Number(f.days) : null,
      comment: f.comment.trim() || null,
    });
  };
  const { root: panelRoot, onKeyDown: panelKeys } = usePanelKeys(submit);
  const field = "rounded border border-rule bg-paper px-1 py-0.5 outline-none focus:border-ai";
  const row = (label: string, children: React.ReactNode) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 shrink-0 text-ink-soft">{label}</span>
      {children}
    </div>
  );
  return (
    <div ref={panelRoot} onKeyDown={panelKeys} className="space-y-2 text-[12px]">
      <p className="text-[11px] text-ink-faint">項目は医師が選びます（最初から選ばれているものはありません）。← → で選び、Tab で次の項目へ、⌘Enter（Ctrl+Enter）で下書きにします。</p>
      {row("区分", <TabChoice label="透析の区分" options={HD_PURPOSES.map((x) => ({ value: x, label: x }))} value={f.purpose} onChange={(v) => set({ purpose: v })} />)}
      {row("方法", <TabChoice label="透析の方法" options={HD_METHODS.map((x) => ({ value: x, label: x }))} value={f.method} onChange={(v) => set({ method: v })} />)}
      {row(
        "日時",
        <>
          <TabChoice
            label="透析の日"
            options={[
              { value: 0, label: "今日" },
              { value: 1, label: "明日" },
            ]}
            value={f.startDay}
            onChange={(v) => set({ startDay: v })}
          />
          <input type="time" value={f.startTime} onChange={(e) => set({ startTime: e.target.value })} aria-label="透析の開始時刻" className={field} />
          <span className="text-[11px] text-ink-faint">空なら透析室と調整</span>
        </>,
      )}
      {row(
        "回数",
        <>
          <TabChoice label="透析の回数" options={master.schedules.map((x, i) => ({ value: i, label: procScheduleText(x) }))} value={f.sched} onChange={(v) => set({ sched: v })} />
          {f.sched !== null && master.schedules[f.sched].kind !== "once" && (
            <>
              <input value={f.days} onChange={(e) => set({ days: e.target.value })} inputMode="numeric" placeholder="—" aria-label="透析の日数" className={`${field} w-10 text-right`} />
              日間
            </>
          )}
        </>,
      )}
      {row("時間", <TabChoice label="透析の時間" options={HD_MINUTES.map((m) => ({ value: m, label: `${m / 60}時間` }))} value={f.minutes} onChange={(v) => set({ minutes: v })} />)}
      {row(
        "血流量",
        <>
          <TabChoice label="血流量" options={HD_QB.map((q) => ({ value: q, label: String(q) }))} value={f.qb} onChange={(v) => set({ qb: v })} />
          mL/分
        </>,
      )}
      {row(
        "膜面積",
        <>
          <TabChoice label="ダイアライザの膜面積" options={HD_MEMBRANES.map((m) => ({ value: m, label: m.toFixed(1) }))} value={f.membrane} onChange={(v) => set({ membrane: v })} />
          m²
        </>,
      )}
      {row("抗凝固薬", <TabChoice label="抗凝固薬" options={(["ヘパリン", "ナファモスタット", "なし"] as const).map((x) => ({ value: x, label: x }))} value={f.drug} onChange={(v) => set({ drug: v, initial: "", hourly: "" })} />)}
      {ac?.initial &&
        row(
          "　初回",
          <>
            <input value={f.initial} onChange={(e) => set({ initial: e.target.value })} inputMode="numeric" aria-label="抗凝固薬の初回量" className={`${field} w-16 text-right`} />
            {ac.initial.unit}
            <TabChoice label="よく使う初回量" options={ac.initial.choices.map((n) => ({ value: n, label: n.toLocaleString("ja-JP") }))} value={f.initial === "" ? null : Number(f.initial)} onChange={(v) => set({ initial: String(v) })} />
          </>,
        )}
      {ac?.hourly &&
        row(
          "　持続",
          <>
            <input value={f.hourly} onChange={(e) => set({ hourly: e.target.value })} inputMode="numeric" aria-label="抗凝固薬の持続量" className={`${field} w-16 text-right`} />
            {ac.hourly.unit}
            <TabChoice label="よく使う持続量" options={ac.hourly.choices.map((n) => ({ value: n, label: n.toLocaleString("ja-JP") }))} value={f.hourly === "" ? null : Number(f.hourly)} onChange={(v) => set({ hourly: String(v) })} />
          </>,
        )}
      {row(
        "除水量",
        <>
          <input value={f.uf} onChange={(e) => set({ uf: e.target.value })} inputMode="decimal" aria-label="除水量（L）" className={`${field} w-14 text-right`} />
          L
          <TabChoice label="よく使う除水量" options={HD_UF.map((n) => ({ value: n, label: String(n) }))} value={f.uf === "" ? null : Number(f.uf)} onChange={(v) => set({ uf: String(v) })} />
        </>,
      )}
      {rate ? (
        <p className={`nums pl-[5.5rem] text-[11px] ${rate.rate > HD_UF_RATE.max ? "font-bold text-shu" : "text-ai"}`}>
          除水速度 {rate.formula}<span className="hint">（コードで計算。体重はカルテの値）</span>{rate.rate > HD_UF_RATE.max ? `　目安の ${HD_UF_RATE.max}mL/kg/時 を超えます` : ""}
        </p>
      ) : uf > 0 && !weightKg ? (
        <p className="pl-[5.5rem] text-[11px] text-ink-faint">体重がカルテにないため、除水速度は計算しません。</p>
      ) : null}
      {row(
        "DW",
        <>
          <input value={f.dw} onChange={(e) => set({ dw: e.target.value })} inputMode="decimal" placeholder="任意" aria-label="ドライウェイト（kg）" className={`${field} w-16 text-right`} />
          kg
        </>,
      )}
      {row("アクセス", <TabChoice label="バスキュラーアクセス" options={HD_ACCESS.map((x) => ({ value: x, label: x }))} value={f.access} onChange={(v) => set({ access: v })} />)}
      <input value={f.comment} onChange={(e) => set({ comment: e.target.value })} placeholder="コメント（任意：補液、透析中の採血、輸血など）" aria-label="透析のコメント" className={`${field} w-full`} />
      <div className="sticky bottom-0 border-t border-rule bg-sheet pt-3">
        <button type="button" disabled={missing.length > 0} onClick={submit} title="⌘Enter（Ctrl+Enter）でも押せます" className="w-full rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
          下書きにする<kbd className="ml-2 rounded border border-white/40 px-1 text-[10px] font-normal">⌘↵</kbd>
        </button>
        {missing.length > 0 && <p className="mt-1 text-[12px] text-yamabuki">未選択：{missing.join("・")}</p>}
      </div>
      <p className="text-[11px] text-ink-faint">除水速度の目安：{HD_UF_RATE.source}（維持透析の目安。病棟の透析では参考として出します）。確定すると処置カレンダー・ワークシート・透析室の「病棟からの透析指示」に出ます。</p>
    </div>
  );
}

/**
 * 輸血: the product and the amount chosen by the doctor, with the blood type on the chart, the latest
 * value, and the expected effect and pace worked out in code (輸血療法実践ガイド; the Ministry's
 * 血液製剤の使用指針・輸血療法の実施に関する指針 were abolished on 2026-03-24).
 */
export function AddTransfusionPanel({ onAdd, newId, blood, weightKg, latest }: { onAdd: (d: Draft) => void; newId: () => string; blood?: Patient["blood"]; weightKg?: number; latest: Record<string, { value: number; day: number } | undefined> }) {
  const [product, setProduct] = useState<TxOrder["product"] | null>(null);
  const [units, setUnits] = useState<number | null>(null);
  const [day, setDay] = useState(0);
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const p = product ? TX_PRODUCTS[product] : null;
  const missing = [!product && "製剤", !units && "量", !reason.trim() && "輸血の理由"].filter((x): x is string => !!x);
  const effect = product && units ? txEffect({ product, units }, weightKg) : null;
  const run = product && units ? txMinutes(txVolume({ product, units })) : null;
  const submit = () => {
    if (missing.length || !blood || !product || !units) return;
    onAdd({ ...newProcedureDraft("PROC-TX", newId()), sourceText: "（輸血の欄から）", tx: { product, units, abo: blood.abo, rh: blood.rh, reason: reason.trim() }, schedule: { kind: "once" }, start: { day, time: time || null }, comment: reason.trim() });
  };
  const { root: panelRoot, onKeyDown: panelKeys } = usePanelKeys(submit);
  const row = (label: string, el: React.ReactNode) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 shrink-0 text-ink-soft">{label}</span>
      {el}
    </div>
  );
  const last = p ? latest[p.lab] : undefined;
  return (
    <div ref={panelRoot} onKeyDown={panelKeys} className="space-y-2 text-[12px]">
      <div className={`rounded-md px-2 py-1.5 ${blood && blood.checks >= 2 ? "bg-paper" : "bg-shu-soft text-shu"}`}>
        血液型：{blood ? `${blood.abo}型 Rh${blood.rh === "+" ? "(+)" : "(−)"}（確認 ${blood.checks}回）　不規則抗体：${blood.antibody ?? "未検査"}` : "未検査"}
        {(!blood || blood.checks < 2) && <span className="ml-1 font-bold">— 別の時点の検体で2回確かめるまで、輸血は出せません</span>}
      </div>
      {row(
        "製剤",
        <TabChoice
          label="血液製剤"
          options={(Object.keys(TX_PRODUCTS) as TxOrder["product"][]).map((k) => ({ value: k, label: TX_PRODUCTS[k].short }))}
          value={product}
          onChange={(v) => {
            setProduct(v);
            setUnits(null);
          }}
        />,
      )}
      {p && row("量", <TabChoice label="製剤の量" options={p.units.map((u) => ({ value: u.units, label: u.label }))} value={units} onChange={setUnits} />)}
      {p && <p className="pl-[5.5rem] text-ink-soft">{p.name}</p>}
      {row(
        "日時",
        <>
          <TabChoice
            label="輸血の日"
            options={[
              { value: 0, label: "今日" },
              { value: 1, label: "明日" },
            ]}
            value={day}
            onChange={setDay}
          />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="輸血の開始時刻" className="rounded border border-rule bg-paper px-1 py-0.5" />
          <span className="text-[11px] text-ink-faint">空なら準備ができしだい</span>
        </>,
      )}
      {row("理由", <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：Hb 6.4、ふらつきあり" className="flex-1 rounded border border-rule bg-paper px-2 py-1" />)}
      {p && (
        <div className="nums space-y-0.5 rounded-md bg-paper px-2 py-1.5 text-ai">
          <div>
            {p.labLabel}：{last ? `${last.value}（最新）` : "カルテに値がありません"}
          </div>
          {effect && (
            <div>
              {effect.text}
              {effect.formula && (
                <>
                  （{effect.formula}<span className="hint">、コードで計算</span>）
                </>
              )}
              <div className="text-[11px] text-ink-soft">{effect.basis}</div>
            </div>
          )}
          {run && (
            <div>
              時間の見込み：約{run.minutes}分（{run.formula}）
              <div className="text-[11px] text-ink-soft">{TX_PACE}</div>
            </div>
          )}
        </div>
      )}
      <div className="sticky bottom-0 border-t border-rule bg-sheet pt-3">
        <button type="button" disabled={missing.length > 0 || !blood} onClick={submit} className="w-full rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
          下書きにする<kbd className="ml-2 rounded border border-white/40 px-1 text-[10px] font-normal">⌘↵</kbd>
        </button>
        {missing.length > 0 && <p className="mt-1 text-yamabuki">未入力：{missing.join("・")}</p>}
      </div>
      <p className="hint text-[11px] text-ink-faint">
        根拠：
        <a href={TX_GUIDE.url} target="_blank" rel="noreferrer" className="text-ai underline">
          {TX_GUIDE.label}
        </a>
        。厚生労働省の旧指針の廃止：
        <a href={TX_NOTICE.url} target="_blank" rel="noreferrer" className="text-ai underline">
          {TX_NOTICE.label}
        </a>
        。下書きで血液型・抗体・同意書をコードが確かめます。
      </p>
    </div>
  );
}

/**
 * The 記憶 (remembered Rps) behind a small clock icon by the drug search: pressing it opens the list over the
 * panel; Esc, a press outside, or copying one closes it. It stays out of the way until wanted.
 */
function MemoryPopover({ label, summary, children }: { label: string; summary: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        title={`${label}：${summary}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-[30px] w-[30px] items-center justify-center rounded border pointer-coarse:h-9 pointer-coarse:w-9 ${open ? "border-ai bg-ai-soft text-ai" : "border-dashed border-rule text-ink-faint hover:border-ai hover:text-ai"}`}
      >
        <History size={14} />
      </button>
      {open && (
        <div role="dialog" aria-label={label} className="absolute right-0 top-full z-20 mt-1 w-[min(28rem,calc(100vw-2rem))] rounded-md border border-rule bg-sheet p-2 text-[12px] shadow-lg">
          <div className="mb-1.5 flex items-center gap-2 font-bold text-ink-soft">
            {label}
            <span className="font-normal text-ink-faint">{summary}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label={`${label}を閉じる`} className="ml-auto rounded px-1 text-ink-faint hover:text-ink">
              ×
            </button>
          </div>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/**
 * 処方の記憶: the doctor's own patterns (most used first), this patient's previous prescriptions (Do),
 * and named sets. Choosing one copies it into an Rp to check and change; nothing is drafted by itself.
 */
function RxMemory({ memory, rps, onPut, newId }: { memory: { patterns: RxPattern[]; previous: RxPattern[]; me: string }; rps: Rp[]; onPut: (ps: Omit<RxPattern, "count" | "lastDay" | "patients" | "key">[]) => void; newId: () => string }) {
  const [tab, setTab] = useState<"often" | "prev" | "sets">("often");
  const [q, setQ] = useState("");
  const [sets, setSets] = useState<RxSet[]>(() => loadSets());
  const [name, setName] = useState("");
  const mySets = sets.filter((s) => s.owner === memory.me);
  const list = (tab === "often" ? memory.patterns : memory.previous).filter((p) => matchPattern(p, q));
  const filledRps = rps.filter((r) => r.rows.length > 0 && r.times !== null);
  const saveSet = () => {
    if (!name.trim() || !filledRps.length) return;
    const next = [
      ...sets,
      {
        id: newId(),
        name: name.trim(),
        owner: memory.me,
        rps: filledRps.map((r) => ({ rows: r.rows.map((x) => ({ drugCode: x.drugCode, per: Number(x.per) || 0 })), times: r.times!, timing: r.timing, days: Number(r.days) || null, category: r.category, prn: r.prn || undefined, maxPerDay: Number(r.maxPerDay) || undefined })),
      },
    ];
    setSets(next);
    saveSets(next);
    setName("");
  };
  const ago = (d: number) => (d === 0 ? "今日" : `${-d}日前`);
  return (
    <MemoryPopover label="処方の記憶" summary={`よく出す処方 ${memory.patterns.length}・前回処方 ${memory.previous.length}・セット ${mySets.length}`}>
      {(close) => (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <TabChoice
              label="処方の記憶"
              options={[
                { value: "often", label: "よく出す処方" },
                { value: "prev", label: "前回処方（Do）" },
                { value: "sets", label: "セット" },
              ]}
              value={tab}
              onChange={(v) => setTab(v as typeof tab)}
            />
            {tab !== "sets" && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="薬で絞る（ひらがな可）" aria-label="処方の記憶を薬で絞る" className="flex-1 rounded border border-rule bg-sheet px-2 py-0.5" />}
          </div>
          {tab === "sets" ? (
            <>
              {mySets.length === 0 && <p className="text-ink-faint">セットはまだありません。下の Rp を入れてから、名前を付けて登録できます。</p>}
              <ul className="space-y-1">
                {mySets.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 rounded border border-rule-soft bg-sheet px-2 py-1">
                    <div className="min-w-0 flex-1">
                      <b>{s.name}</b>
                      {s.rps.map((r, i) => (
                        <div key={i} className="nums text-ink-soft">
                          {patternLine(r)}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onPut(s.rps);
                        close();
                      }}
                      className="shrink-0 rounded bg-ai px-2 py-0.5 font-bold text-white"
                    >
                      写す
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = sets.filter((x) => x.id !== s.id);
                        setSets(next);
                        saveSets(next);
                      }}
                      className="shrink-0 text-ink-faint hover:text-shu"
                    >
                      消す
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-1.5">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="セットの名前（例：便秘時セット）" aria-label="セットの名前" className="flex-1 rounded border border-rule bg-sheet px-2 py-0.5" />
                <button type="button" disabled={!name.trim() || !filledRps.length} onClick={saveSet} className="rounded border border-ai px-2 py-0.5 font-bold text-ai disabled:opacity-40">
                  いまの Rp（{filledRps.length}）を登録
                </button>
              </div>
              <p className="text-[11px] text-ink-faint">セットは自分の名前で、このブラウザに保存します（この端末のみに適用されます）。</p>
            </>
          ) : (
            <ul className="scroll-thin max-h-52 space-y-1 overflow-y-auto">
              {list.length === 0 && <li className="text-ink-faint">{tab === "prev" ? "この患者の前回の処方はありません（持参薬は除く）。" : "当てはまる処方はありません。"}</li>}
              {list.map((p) => (
                <li key={`${p.key}-${p.lastDay}`} className="flex items-start gap-2 rounded border border-rule-soft bg-sheet px-2 py-1">
                  <div className="nums min-w-0 flex-1">
                    <div>{patternLine(p)}</div>
                    <div className="text-[11px] text-ink-faint">{tab === "often" ? `${p.count}回・${p.patients}人・最後は${ago(p.lastDay)}` : `${ago(p.lastDay)}の処方`}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onPut([p]);
                      close();
                    }}
                    className="shrink-0 rounded bg-ai px-2 py-0.5 font-bold text-white"
                  >
                    写す
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-ink-faint">よく出す処方は、自分が過去に出した処方（架空のデータを含む）を Rp ごとにまとめ、回数と新しさの順に並べたものです。写したあと、量・日数を確かめてから下書きにします。</p>
        </div>
      )}
    </MemoryPopover>
  );
}

/** リハビリ処方: the disease category, who, the onset day it is counted from, the goal and cautions (all chosen by the doctor). */
export function AddRehabPanel({ onAdd, newId, admittedOn, rest }: { onAdd: (d: Draft) => void; newId: () => string; admittedOn: number; rest?: string | null }) {
  const [field, setField] = useState<RehabOrder["field"] | null>(null);
  const [who, setWho] = useState<RehabOrder["therapists"]>([]);
  const [onset, setOnset] = useState<number | null>(null);
  const [goal, setGoal] = useState("");
  const [cautions, setCautions] = useState("");
  const missing = [!field && "区分", !who.length && "職種", onset === null && "起算日", !goal.trim() && "目標"].filter((x): x is string => !!x);
  const submit = () => {
    if (missing.length) return;
    onAdd({ ...newProcedureDraft("PROC-REHAB", newId()), sourceText: "（リハビリの欄から）", rehab: { field: field!, therapists: who, onset: onset!, goal: goal.trim(), cautions: cautions.trim() }, schedule: { kind: "per_day", count: 1 }, start: { day: 1, time: null } });
  };
  const { root: panelRoot, onKeyDown: panelKeys } = usePanelKeys(submit);
  const input = "w-full rounded border border-rule bg-paper px-2 py-1";
  return (
    <div ref={panelRoot} onKeyDown={panelKeys} className="space-y-2 text-[12px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-16 text-ink-soft">区分</span>
        <TabChoice label="疾患別リハビリの区分" options={REHAB_FIELDS.map((f) => ({ value: f, label: f }))} value={field} onChange={setField} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-16 text-ink-soft">職種</span>
        {(["PT", "OT", "ST"] as const).map((t) => (
          <label key={t} className={`flex items-center gap-1 rounded border px-2 py-0.5 ${who.includes(t) ? "border-ai bg-ai-soft" : "border-rule"}`}>
            <input type="checkbox" checked={who.includes(t)} onChange={() => setWho((w) => (w.includes(t) ? w.filter((x) => x !== t) : [...w, t]))} className="accent-ai" />
            {t === "PT" ? "PT（理学療法）" : t === "OT" ? "OT（作業療法）" : "ST（言語聴覚療法）"}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-16 text-ink-soft">起算日</span>
        <TabChoice
          label="起算日"
          options={[
            { value: admittedOn, label: "入院日" },
            { value: admittedOn - 1, label: "入院の前日（発症）" },
            { value: 0, label: "今日" },
          ]}
          value={onset}
          onChange={setOnset}
        />
        <span className="text-[11px] text-ink-faint">発症・手術・急性増悪の日</span>
      </div>
      <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="目標（例：病棟内を杖歩行で自立、自宅退院）" aria-label="リハビリの目標" className={input} />
      <input value={cautions} onChange={(e) => setCautions(e.target.value)} placeholder="注意・中止の基準（例：SpO2 90%未満で中止、右下肢は荷重可）" aria-label="リハビリの注意" className={input} />
      {rest && <p className="text-[11px] text-ink-soft">指示簿の安静度：{rest}（リハビリと合っているか確かめてください）</p>}
      <button type="button" disabled={missing.length > 0} onClick={submit} className="w-full rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
        下書きにする（明日から）
      </button>
      {missing.length > 0 && <p className="text-yamabuki">未入力：{missing.join("・")}</p>}
    </div>
  );
}

/** 他科依頼: ask another department (the doctor writes the question), and record their answer (返書). */
export function AddConsultPanel({ onAdd, newId, consults, replies, onReply }: { onAdd: (d: Draft) => void; newId: () => string; consults: OrderEntry[]; replies: Record<string, { text: string; by: string; at: string }>; onReply: (entryId: string, text: string, by: string) => void }) {
  const [dept, setDept] = useState<string | null>(null);
  const [urgency, setUrgency] = useState<ConsultOrder["urgency"] | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Record<string, { text: string; by: string }>>({});
  const missing = [!dept && "依頼先", !urgency && "至急か", !question.trim() && "聞きたいこと"].filter((x): x is string => !!x);
  const submit = () => {
    if (missing.length) return;
    onAdd({ ...newProcedureDraft("PROC-CONSULT", newId()), sourceText: "（他科依頼の欄から）", consult: { dept: dept!, urgency: urgency!, question: question.trim() }, schedule: { kind: "once" }, start: { day: 0, time: null } });
    setDept(null);
    setUrgency(null);
    setQuestion("");
  };
  const input = "w-full rounded border border-rule bg-paper px-2 py-1";
  return (
    <div className="space-y-3 text-[12px]">
      {consults.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-bold text-ink-soft">これまでの依頼と返書</h3>
          {consults.map((e) => {
            const c = e.order.type === "procedure" ? e.order.consult : undefined;
            if (!c) return null;
            const r = replies[e.id];
            const a = answer[e.id] ?? { text: "", by: "" };
            return (
              <div key={e.id} className="rounded-md border border-rule bg-sheet p-2">
                <div className="nums text-[11px] text-ink-faint">
                  {e.time}　{e.author}
                </div>
                <div>{consultText(c)}</div>
                {r ? (
                  <p className="mt-1 whitespace-pre-wrap rounded bg-wakatake-soft px-2 py-1">
                    <b>返書</b>（{r.at} {r.by}）：{r.text}
                  </p>
                ) : (
                  <div className="mt-1 space-y-1">
                    <textarea value={a.text} onChange={(x) => setAnswer((all) => ({ ...all, [e.id]: { ...a, text: x.target.value } }))} rows={2} placeholder={`${c.dept}の医師の返書（書いた本人が入れる）`} aria-label="返書" className={input} />
                    <div className="flex items-center gap-1.5">
                      <input value={a.by} onChange={(x) => setAnswer((all) => ({ ...all, [e.id]: { ...a, by: x.target.value } }))} placeholder={`返書を書いた医師（例：${c.dept} 田中）`} aria-label="返書を書いた医師" className={`${input} flex-1`} />
                      <button type="button" disabled={!a.text.trim() || !a.by.trim()} onClick={() => onReply(e.id, a.text.trim(), a.by.trim())} className="rounded bg-wakatake px-3 py-1 font-bold text-white disabled:opacity-40">
                        返書を記録
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
      <section className="space-y-2 rounded-md border border-rule p-2">
        <h3 className="font-bold">新しく依頼する</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-14 text-ink-soft">依頼先</span>
          <select value={dept ?? ""} onChange={(e) => setDept(e.target.value || null)} aria-label="依頼先の科" className="rounded border border-rule bg-paper px-2 py-1">
            <option value="">選ぶ</option>
            {CONSULT_DEPTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <TabChoice label="至急か" options={(["至急", "通常"] as const).map((x) => ({ value: x, label: x }))} value={urgency} onChange={setUrgency} />
        </div>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} placeholder="聞きたいこと（例：心房細動の抗凝固療法について、ご高診をお願いします）" aria-label="聞きたいこと" className={input} />
        <button type="button" disabled={missing.length > 0} onClick={submit} className="w-full rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
          下書きにする
        </button>
        {missing.length > 0 && <p className="text-yamabuki">未入力：{missing.join("・")}</p>}
      </section>
    </div>
  );
}

const injLine = (o: InjectionOrder) =>
  `${o.items.map((i) => `${masterOf(i.drugCode)?.name ?? i.drugCode} ${i.amount}${i.unit}`).join(" ＋ ")}　${o.route}　${scheduleLabel(o.schedule, o.items[0]?.drugCode)}${o.minutesPerDose ? `　1回${minutesLabel(o.minutesPerDose)}` : ""}${o.rateMlPerH ? `　${o.rateMlPerH}mL/時` : ""}${o.days ? `　${o.days}日間` : ""}`;

/** 注射の記憶: the doctor's injections (most used first) and this patient's previous ones (Do). */
function InjMemory({ memory, onPut }: { memory: { patterns: InjPattern[]; previous: InjPattern[] }; onPut: (o: InjectionOrder) => void }) {
  const [tab, setTab] = useState<"often" | "prev">("often");
  const [q, setQ] = useState("");
  const list = (tab === "often" ? memory.patterns : memory.previous).filter((p) => matchInj(p, q));
  const ago = (d: number) => (d === 0 ? "今日" : `${-d}日前`);
  return (
    <MemoryPopover label="注射の記憶" summary={`よく出す注射 ${memory.patterns.length}・前回の注射 ${memory.previous.length}`}>
      {(close) => (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <TabChoice
              label="注射の記憶"
              options={[
                { value: "often", label: "よく出す注射" },
                { value: "prev", label: "前回の注射（Do）" },
              ]}
              value={tab}
              onChange={(v) => setTab(v as typeof tab)}
            />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="薬で絞る（ひらがな可）" aria-label="注射の記憶を薬で絞る" className="flex-1 rounded border border-rule bg-sheet px-2 py-0.5" />
          </div>
          <ul className="scroll-thin max-h-52 space-y-1 overflow-y-auto">
            {list.length === 0 && <li className="text-ink-faint">{tab === "prev" ? "この患者の前の注射はありません。" : "当てはまる注射はありません。"}</li>}
            {list.map((p) => (
              <li key={`${p.key}-${p.lastDay}`} className="flex items-start gap-2 rounded border border-rule-soft bg-sheet px-2 py-1">
                <div className="nums min-w-0 flex-1">
                  <div>{injLine(p.order)}</div>
                  <div className="text-[11px] text-ink-faint">{tab === "often" ? `${p.count}回・${p.patients}人・最後は${ago(p.lastDay)}` : `${ago(p.lastDay)}のオーダ`}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onPut(p.order);
                    close();
                  }}
                  className="shrink-0 rounded bg-ai px-2 py-0.5 font-bold text-white"
                >
                  写す
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-ink-faint">自分が過去に出した注射（架空のデータを含む）を、同じ薬・経路・回数・落とし方ごとにまとめています。抗がん薬は出しません（レジメンの欄から）。写したあと、開始と日数を確かめて下書きにします。</p>
        </div>
      )}
    </MemoryPopover>
  );
}

/** 退院申込・外泊・外出: kind, when, where to and (外泊・外出) when back — chosen by the doctor. */
export function AddLeavePanel({ onAdd, newId, kinds = ["退院", "外泊", "外出"], initialDay = null }: { onAdd: (d: Draft) => void; newId: () => string; kinds?: LeaveOrder["kind"][]; initialDay?: number | null }) {
  const [kind, setKind] = useState<LeaveOrder["kind"] | null>(kinds.length === 1 ? kinds[0] : null);
  const [day, setDay] = useState<number | null>(initialDay);
  const [time, setTime] = useState("");
  const [backDay, setBackDay] = useState<number | null>(null);
  const [backTime, setBackTime] = useState("");
  const [dest, setDest] = useState("");
  const [note, setNote] = useState("");
  const away = kind === "外泊" || kind === "外出";
  const missing = [!kind && "種類", day === null && "日", !time && "時刻", !dest.trim() && "行き先", away && backDay === null && "戻る日", away && !backTime && "戻る時刻"].filter((x): x is string => !!x);
  const days = [
    { value: 0, label: "今日" },
    { value: 1, label: "明日" },
    { value: 2, label: "あさって" },
    { value: 3, label: "3日後" },
    ...(initialDay !== null && initialDay > 3 ? [{ value: initialDay, label: `${initialDay}日後` }] : []),
  ];
  const submit = () => {
    if (missing.length) return;
    const leave: LeaveOrder = { kind: kind!, from: { day: day!, time }, ...(away ? { back: { day: backDay!, time: backTime } } : {}), destination: dest.trim(), note: note.trim() };
    onAdd({ ...newProcedureDraft("PROC-LEAVE", newId()), sourceText: "（退院・外泊の欄から）", leave, schedule: { kind: "once" }, start: { day: day!, time } });
  };
  const row = (label: string, el: React.ReactNode) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-16 text-ink-soft">{label}</span>
      {el}
    </div>
  );
  return (
    <div className="space-y-2 text-[12px]">
      {kinds.length > 1 && row("種類", <TabChoice label="退院・外泊・外出" options={kinds.map((x) => ({ value: x, label: x }))} value={kind} onChange={setKind} />)}
      {row(
        kind === "退院" ? "退院" : "出る",
        <>
          <TabChoice label="出る日" options={days} value={day} onChange={setDay} />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="出る時刻" className="rounded border border-rule bg-paper px-1 py-0.5" />
        </>,
      )}
      {away &&
        row(
          "戻る",
          <>
            <TabChoice label="戻る日" options={days} value={backDay} onChange={setBackDay} />
            <input type="time" value={backTime} onChange={(e) => setBackTime(e.target.value)} aria-label="戻る時刻" className="rounded border border-rule bg-paper px-1 py-0.5" />
          </>,
        )}
      {row("行き先", <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder={kind === "退院" ? "例：自宅（長女と同居）・施設・転院先" : "例：自宅"} className="flex-1 rounded border border-rule bg-paper px-2 py-1" />)}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="申し送り（例：介護タクシー、退院処方は7日分）" aria-label="退院・外泊の申し送り" className="w-full rounded border border-rule bg-paper px-2 py-1" />
      <button type="button" disabled={missing.length > 0} onClick={submit} className="w-full rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
        下書きにする
      </button>
      {missing.length > 0 && <p className="text-yamabuki">未入力：{missing.join("・")}</p>}
    </div>
  );
}

/** 指導の依頼: which guidance (it goes to that profession's やること) and what to cover. */
export function AddGuidePanel({ onAdd, newId }: { onAdd: (d: Draft) => void; newId: () => string }) {
  const [kind, setKind] = useState<GuideOrder["kind"] | null>(null);
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2 text-[12px]">
      <TabChoice label="指導の種類" options={(Object.keys(GUIDE_TO) as GuideOrder["kind"][]).map((k) => ({ value: k, label: `${k}（${GUIDE_TO[k]}）` }))} value={kind} onChange={setKind} />
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="伝えたいこと（例：減塩6g未満。家族も一緒に）" aria-label="指導で伝えたいこと" className="w-full rounded border border-rule bg-paper px-2 py-1" />
      <button
        type="button"
        disabled={!kind}
        onClick={() => kind && onAdd({ ...newProcedureDraft("PROC-GUIDE", newId()), sourceText: "（指導の依頼の欄から）", guide: { kind, note: note.trim() }, schedule: { kind: "once" }, start: { day: 0, time: null } })}
        className="w-full rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
      >
        下書きにする
      </button>
    </div>
  );
}
