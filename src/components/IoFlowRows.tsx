"use client";

import { FlowOrderedRows, FlowRow } from "./FlowOrderedRows";
import { DEFAULT_LAYOUT, type FlowLayout } from "@/lib/flow-layout";
import { displayText } from "@/lib/display-text";
import { fluidInWindow } from "@/lib/flowsheet";
import { IN_KINDS, OUT_KINDS, inWindow, ioDay, ioDayOf, ioShifts, ioTotal, signed, type IoEntry, type IoLine, type IoWindow } from "@/lib/io-balance";
import type { AdminRecord } from "@/lib/mar";
import { findDrug } from "@/lib/master";
import type { OrderEntry } from "@/lib/types";

/** 水分出納 for the flow sheet: the typed IN/OUT of the patient, the drip records, and the 指示簿. */
export interface FlowIo {
  typed: IoEntry[];
  records: Record<string, AdminRecord>;
  sessionStart: number;
  standingIo: string | null;
  onAdd?: (entries: IoEntry[]) => void;
}

interface Props {
  layout?: FlowLayout;
  lines: IoLine[];
  orders: OrderEntry[];
  nowAbs: number;
  /** The flow sheet's time axis: its first and last minute, minutes → x, and the sizes. */
  t0: number;
  endAbs: number;
  xAbs: (a: number) => number;
  plotW: number;
  labelW: number;
  standingIo: string | null;
  /** Zoomed in: each IN/OUT at its time, and the totals per shift (日勤・夜勤) instead of per 24 hours. */
  byTime?: boolean;
}

type Cell = { top: string; sub?: string; title: string };

/** What the heading of the 水分出納 group says: the unit and the 指示簿 (how the cells are cut is in the help). */
export function IoHeading({ standingIo }: { standingIo: string | null }) {
  return (
    <span className="font-normal text-ink-faint">
      mL　指示簿：{standingIo ?? "なし"}
    </span>
  );
}

const r = (x: number) => String(Math.round(x));

/**
 * 水分出納 on the flow sheet: one cell per 24 hours (from the close, 9:00 → 9:00) on the same time axis
 * as the vitals. Recorded amounts and what the orders plan are kept apart: the plan is in ( ). Each drip
 * has its own row (this period / its total since it began), then IN合計, each OUT, OUT合計 and IN − OUT.
 */
export function IoFlowRows({ lines, orders, nowAbs, t0, endAbs, xAbs, plotW, labelW, byTime = false, layout = DEFAULT_LAYOUT }: Props) {
  const days: number[] = [];
  for (let d = ioDayOf(t0 + 1); ioDay(d).lo < endAbs; d++) days.push(d);
  const wins = byTime ? days.flatMap((d) => ioShifts(d)).filter((w) => w.hi > t0 && w.lo < endAbs) : days.map((d) => ioDay(d));
  const state = (w: IoWindow) => (w.hi <= nowAbs ? "past" : w.lo >= nowAbs ? "future" : "now");
  const upTo = (w: IoWindow) => ({ lo: w.lo, hi: Math.min(w.hi, nowAbs) });
  const sum = (ls: IoLine[], w: { lo: number; hi: number }) => ls.filter((l) => inWindow(l.at, w) && l.measured !== false).reduce((a, l) => a + l.ml, 0);
  const injections = orders.filter((e) => e.order.type === "injection");
  const planOf = (e: OrderEntry, w: IoWindow) => fluidInWindow([e], w.lo, w.hi, nowAbs);
  const drips = injections.filter((e) => lines.some((l) => l.orderId === e.id) || wins.some((w) => state(w) !== "past" && planOf(e, w) > 0));
  const shiftTitle = (w: IoWindow) =>
    ioShifts(ioDayOf(w.hi))
      .filter((s) => s.lo < nowAbs)
      .map((s) => `${s.label}：${ioTotal(lines, upTo(s)).formula}`)
      .join("\n");

  const dripCell = (e: OrderEntry, w: IoWindow): Cell => {
    const mine = lines.filter((l) => l.orderId === e.id);
    const rec = sum(mine, upTo(w));
    const cum = sum(mine, { lo: -Infinity, hi: Math.min(w.hi, nowAbs) });
    const plan = planOf(e, w);
    const st = state(w);
    const top = st === "future" ? "" : rec || cum ? `${r(rec)}/${r(cum)}` : "";
    const detail = mine.filter((l) => inWindow(l.at, upTo(w))).map((l) => `${l.what}：${l.formula ?? `${l.ml}mL`}（${l.from}）`);
    return { top, sub: st !== "past" && plan ? `(${r(plan)})` : undefined, title: [`この期間 ${r(rec)}mL ／ 開始からの合計 ${r(cum)}mL`, ...detail, st !== "past" ? `オーダからの予定量 ${r(plan)}mL（記録とは別）` : ""].filter(Boolean).join("\n") };
  };
  const kindCell = (side: "IN" | "OUT", kind: string, w: IoWindow): Cell => {
    const ls = lines.filter((l) => l.side === side && l.kind === kind && !l.orderId && l.measured !== false);
    const v = sum(ls, upTo(w));
    return { top: state(w) === "future" || !ls.some((l) => inWindow(l.at, upTo(w))) ? "" : r(v), title: `${kind} ${r(v)}mL` };
  };
  const totalCell = (side: "IN" | "OUT", w: IoWindow): Cell => {
    const t = ioTotal(lines, upTo(w));
    const st = state(w);
    const count = side === "IN" ? t.inCount : t.outCount;
    if (side === "OUT") return { top: st === "future" || !count ? "" : r(t.out), title: `${t.formula}\n${shiftTitle(w)}` };
    // The projection: what is recorded, plus what each drip still has to go in this period by the orders.
    const projection = t.in + drips.reduce((a, e) => a + Math.max(0, planOf(e, w) - sum(lines.filter((l) => l.orderId === e.id), upTo(w))), 0);
    return { top: st === "future" || !count ? "" : r(t.in), sub: st !== "past" && projection > t.in ? `(${r(projection)})` : undefined, title: `${t.formula}\n${shiftTitle(w)}${st !== "past" ? `\n見込み ${r(projection)}mL ＝ 記録 ${r(t.in)}mL ＋ 点滴の残りの予定（オーダから）` : ""}` };
  };
  const balanceCell = (w: IoWindow): Cell => {
    const t = ioTotal(lines, upTo(w));
    return { top: state(w) === "future" || t.balance === null ? "" : signed(t.balance), title: `${t.formula}\n${shiftTitle(w)}` };
  };

  const inKinds = IN_KINDS.filter(k => k !== "食事" && k !== "点滴");
  const outKinds = OUT_KINDS;
  const observations = lines.filter(l => l.entryId && (l.kind === "食事" || l.kind === "尿" || l.kind === "便"));

  const shortDrug = (e: OrderEntry) => {
    if (e.order.type !== "injection") return "";
    const d = findDrug(e.order.items[0].drugCode);
    return d ? (d.aliases[0] ?? d.name) : e.order.items[0].drugCode;
  };

  const row = (key: string, label: string, sub: string | undefined, cell: (w: IoWindow) => Cell, bold = false) => {
    const cells = wins.map((w) => ({ w, c: cell(w) }));
    const tall = cells.some((x) => x.c.sub);
    if (layout.hidden.includes(`io:${key}`)) return null;
    return (
      <FlowRow key={key} id={`io:${key}`}><div key={key} className={`flex border-b border-rule-soft ${bold ? "bg-paper font-bold" : ""}`}>
        <div className="shrink-0 py-1 pr-2 text-right text-ink-soft" style={{ width: labelW }}>
          {label}
          {sub && <div className="text-[9px] font-normal text-ink-faint">{sub}</div>}
        </div>
        <div className={`relative flex-1 ${tall ? "h-9" : "h-6"}`}>
          {cells.map(({ w, c }) => {
            const x1 = xAbs(Math.max(w.lo, t0));
            const x2 = Math.min(plotW, xAbs(Math.min(w.hi, endAbs)));
            return (
              <span key={w.lo} title={c.title} className={`absolute top-1 overflow-hidden text-center leading-tight ${state(w) === "future" ? "text-ink-faint" : "text-ink"}`} style={{ left: x1, width: Math.max(0, x2 - x1) }}>
                {c.top}
                {c.sub && <span className="block text-[9px] font-normal text-ink-faint">{c.sub}</span>}
              </span>
            );
          })}
        </div>
      </div></FlowRow>
    );
  };

  // Zoomed in: each recorded amount at its time (the drips at the time they ended).
  const lineRow = (key: string, label: string, sub: string | undefined, ls: IoLine[]) => layout.hidden.includes(`io:${key}`) ? null : (
    <FlowRow key={key} id={`io:${key}`}>
    <div key={key} className="flex border-b border-rule-soft">
      <div className="shrink-0 py-1 pr-2 text-right text-ink-soft" style={{ width: labelW }}>
        {label}
        {sub && <div className="text-[9px] font-normal text-ink-faint">{sub}</div>}
      </div>
      <div className="relative h-6 flex-1">
        {ls
          .filter((l) => l.at >= t0 && l.at <= endAbs)
          .map((l, i) => (
            <span key={`${l.at}-${i}`} title={displayText(`${l.what}：${l.formula ?? `${l.ml}mL`}（${l.from}・${l.by}）`)} className="absolute top-1 -translate-x-1/2 whitespace-nowrap text-ink" style={{ left: xAbs(l.at) }}>
              {l.measured === false ? l.what : r(l.ml)}
            </span>
          ))}
      </div>
    </div></FlowRow>
  );

  return (
    <>
      <div className="relative"><FlowOrderedRows layout={layout}>
        {byTime
          ? drips.map((e) => lineRow(e.id, shortDrug(e), e.order.type === "injection" ? `${e.order.route}　終了時` : undefined, lines.filter((l) => l.orderId === e.id)))
          : drips.map((e) => row(e.id, shortDrug(e), e.order.type === "injection" ? `${e.order.route}　今回/計` : undefined, (w) => dripCell(e, w)))}
        {inKinds.map((k) => (byTime ? lineRow(`in-${k}`, k, "IN", lines.filter((l) => l.side === "IN" && l.kind === k && !l.orderId)) : row(`in-${k}`, k, "IN", (w) => kindCell("IN", k, w))))}
        {row("in", "IN合計", undefined, (w) => totalCell("IN", w), true)}
        {outKinds.map((k) => (byTime ? lineRow(`out-${k}`, k, "OUT", lines.filter((l) => l.side === "OUT" && l.kind === k)) : row(`out-${k}`, k, "OUT", (w) => kindCell("OUT", k, w))))}
        {row("out", "OUT合計", undefined, (w) => totalCell("OUT", w), true)}
        {lineRow("details", "食事・排泄", "回数・性状", observations.map(l => ({ ...l, measured: false })))}
        {row("bal", "IN − OUT", undefined, balanceCell, true)}
        </FlowOrderedRows>{nowAbs > t0 && nowAbs < endAbs && <span aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-[#8c8473]" style={{ left: labelW + xAbs(nowAbs) }} />}
      </div>

    </>
  );
}

/* ヘルプへ移動した説明:
縦の線がいま。左は記録した量、（ ）はオーダから計算した点滴の予定量で、記録とは分けています（IN合計の（ ）は、点滴を予定どおりに入れたときの見込み）。点滴の行は「この期間／その注射の開始からの合計」。点滴は終了の記録（1本 − 残量）の時刻に入ります。IN か OUT の記録がない期間は差を出しません。 セルに触れると勤務ごとの式が出ます。
*/
