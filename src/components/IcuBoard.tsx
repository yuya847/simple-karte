"use client";
import { useEffect, useRef, useState } from "react";
import { TabChoice } from "./TabChoice";
import { boardRows, type BoardOrders } from "@/lib/icu/board";
import type { IcuRecords, UnitKind } from "@/lib/icu/types";
import type { Patient } from "@/lib/types";
import type { BedAssignment } from "@/lib/ward";
import type { CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import { useLongPress } from "@/lib/use-long-press";

type Row = ReturnType<typeof boardRows>[number];

// The drug's name without the product's strength and maker (ノルアドレナリン注射液 0.1%1mL → ノルアドレナリン), then the dose.
const shortName = (s: string) => { const first = s.split(" ")[0]; return first.match(/^[ァ-ヶー]+/)?.[0] ?? first; };
const shortDrug = (s: string) => `${shortName(s)} ${s.split(" ").at(-1)}`;
const chip = "rounded bg-paper px-1.5 py-px";

export function IcuBoard({ patients, beds, records, nowTime, onOpen, orders }: { patients: Patient[]; beds: BedAssignment[]; records: IcuRecords; today: CalendarDate | null; nowTime: string; onOpen: (id: string) => void; orders: BoardOrders }) {
  const [unit,setUnit] = useState<UnitKind>("ICU");
  // The bed whose card a long press (finger) keeps open; the mouse shows it on hover.
  const [peek,setPeek] = useState<string | null>(null);
  useEffect(() => {
    if (!peek) return;
    const away = () => setPeek(null);
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, [peek]);
  const rows = boardRows(unit,patients,beds,records,0,abs(0,nowTime),orders);
  // A ward map, not a chart: who is in which bed and what keeps them going. The numbers are in the card and the ICU 記録.
  return <section className="space-y-3 p-4" aria-label="ICU・HCU">
    <TabChoice label="病棟" options={[{ value:"ICU",label:"ICU" },{ value:"HCU",label:"HCU" }]} value={unit} onChange={setUnit}/>
    <div className="grid grid-cols-4 gap-2">{rows.map((r,i) => <BedTile key={r.bed} r={r} right={i % 4 === 3} pinned={peek === r.bed} onPeek={() => setPeek(r.bed)} onOpen={onOpen}/>)}</div>
  </section>;
}

const when = (day: number) => day === 1 ? "明日" : day === 0 ? "今日" : `${day}日後`;

function BedTile({ r, right, pinned, onPeek, onOpen }: { r: Row; right: boolean; pinned: boolean; onPeek: () => void; onOpen: (id: string) => void }) {
  // A long press ends with the finger lifted: that click must not also open the chart.
  const held = useRef(false);
  const press = useLongPress<HTMLButtonElement>(r.patient ? () => { held.current = true; onPeek(); } : undefined);
  const opens = r.patient?.id ?? r.incoming?.id;
  return <button disabled={!opens} aria-describedby={r.patient ? `icu-card-${r.bed}` : undefined}
    {...press}
    onPointerDownCapture={() => { held.current = false; }}
    onClick={() => { if (held.current) { held.current = false; return; } if (opens) onOpen(opens); }}
    className="group relative flex min-h-24 select-none flex-col justify-start rounded border border-rule bg-sheet p-2 text-left text-xs [-webkit-touch-callout:none] hover:bg-paper disabled:border-dashed disabled:bg-transparent disabled:text-ink-faint">
    <div className="flex w-full items-baseline gap-1.5"><b className="text-sm">{r.bed}</b>{r.patient ? <><span className="truncate text-sm">{r.patient.name}</span><span className="ml-auto shrink-0 text-ink-faint">{r.patient.age}{r.patient.sex}・{r.days}</span></> : <span>空床</span>}</div>
    {r.patient && <>
      <div className="mt-0.5 truncate text-ink-soft">{r.diagnosis}</div>
      <div className="mt-1 flex flex-wrap gap-1">{r.vent && <span className={chip}>{r.vent.split(" ")[0]}</span>}{r.infusions.map((inf,i) => <span key={i} className={chip}>{shortDrug(inf)}</span>)}{r.crrt && <span className={chip}>{r.crrt.split(" ")[0]}</span>}</div>
      {r.planned && <div className="mt-1 text-ai">→ {r.planned.to} {when(r.planned.day)} {r.planned.time}{r.planned.conflict && <span className="text-shu">・{r.planned.conflict}</span>}</div>}
      <BedCard r={r} id={`icu-card-${r.bed}`} right={right} pinned={pinned}/>
    </>}
    {r.incoming && <div className="mt-1 text-ai">← {r.incoming.name}（{r.incoming.from}）{when(r.incoming.day)} {r.incoming.time}</div>}
  </button>;
}

/** The numbers behind a tile, on hover (mouse), focus (keyboard) or a long press (finger). Only what has a value. */
function BedCard({ r, id, right, pinned }: { r: Row; id: string; right: boolean; pinned: boolean }) {
  const sofa = (n: number | null, assumed: boolean) => <><b className="text-[13px] text-ink">{n ?? "—"}</b>{assumed && <span className="ml-0.5 text-yamabuki">推定</span>}</>;
  const b = r.balance24h, v = r.latest;
  const vitals = v ? ([["HR", v.hr], ["MAP", v.map], ["SpO2", v.spo2], ["RR", v.rr], ["BT", v.bt === undefined ? undefined : v.bt.toFixed(1)], ["RASS", v.rass === undefined ? undefined : v.rass > 0 ? `+${v.rass}` : String(v.rass)]] as const).filter(([, x]) => x !== undefined && x !== null) : [];
  const ml = (n: number) => Math.round(n).toLocaleString("ja-JP");
  const label = "text-ink-faint";
  return <span id={id} role="tooltip" className={`nums pointer-events-none absolute top-full z-20 mt-1 grid w-96 grid-cols-[auto_1fr] items-baseline gap-x-2.5 gap-y-1 rounded-md border border-rule bg-sheet p-2.5 text-[12px] leading-snug text-ink shadow-[0_12px_32px_-8px_rgba(38,34,28,0.4)] transition-[opacity,visibility] duration-100 ${right ? "right-0" : "left-0"} ${pinned ? "visible opacity-100" : "invisible opacity-0 group-hover:visible group-hover:opacity-100 group-hover:delay-300 group-focus-visible:visible group-focus-visible:opacity-100"}`}>
    {(r.sofaToday !== null || r.sofaYesterday !== null) && <><span className={label}>SOFA</span><span>{sofa(r.sofaToday, r.sofaAssumed.today)}<span className={`ml-3 ${label}`}>昨日</span> {sofa(r.sofaYesterday, r.sofaAssumed.yesterday)}</span></>}
    {b && <><span className={label}>{b.range}</span><span>IN {ml(b.inMl)}　OUT {ml(b.outMl)}　<b>{b.netMl >= 0 ? "+" : "−"}{ml(Math.abs(b.netMl))}</b> mL</span></>}
    {r.lines.length > 0 && <><span className={label}>ライン</span><span>{r.lines.map((l, i) => <span key={i} className="mr-2 inline-block">{l.kind} {l.flag ? <b>{l.days}</b> : l.days}</span>)}</span></>}
    {r.drips.length > 0 && <><span className={label}>持続</span><span>{r.drips.map((d, i) => <span key={i} className="block">{shortName(d.name)} <b>{d.dose}</b>{d.mlh !== null && <span className="text-ink-soft">　{d.mlh.toFixed(1)} mL/h</span>}</span>)}</span></>}
    {vitals.length > 0 && <span className="col-span-2 flex flex-wrap gap-x-2.5 border-t border-rule pt-1">{vitals.map(([k, x]) => <span key={k}><span className={label}>{k}</span> {x}</span>)}</span>}
  </span>;
}
