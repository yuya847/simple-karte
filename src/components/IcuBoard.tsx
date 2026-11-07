"use client";
import { useState } from "react";
import { TabChoice } from "./TabChoice";
import { boardRows, type BoardOrders } from "@/lib/icu/board";
import type { IcuRecords, UnitKind } from "@/lib/icu/types";
import type { Patient } from "@/lib/types";
import type { BedAssignment } from "@/lib/ward";
import type { CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";

export function IcuBoard({ patients, beds, records, nowTime, onOpen, orders }: { patients: Patient[]; beds: BedAssignment[]; records: IcuRecords; today: CalendarDate | null; nowTime: string; onOpen: (id: string) => void; orders: BoardOrders }) {
  const [unit,setUnit] = useState<UnitKind>("ICU");
  const rows = boardRows(unit,patients,beds,records,0,abs(0,nowTime),orders);
  // A ward map, not a chart: who is in which bed and what keeps them going. The numbers are in the ICU 記録.
  // The drug's name without the product's strength and maker (ノルアドレナリン注射液 0.1%1mL → ノルアドレナリン), then the dose.
  const shortDrug = (s: string) => { const parts = s.split(" "); return `${parts[0].match(/^[ァ-ヶー]+/)?.[0] ?? parts[0]} ${parts.at(-1)}`; };
  const chip = "rounded bg-paper px-1.5 py-px";
  return <section className="space-y-3 p-4" aria-label="ICU・HCU">
    <TabChoice label="病棟" options={[{ value:"ICU",label:"ICU" },{ value:"HCU",label:"HCU" }]} value={unit} onChange={setUnit}/>
    <div className="grid grid-cols-4 gap-2">{rows.map(r => <button key={r.bed} disabled={!r.patient} onClick={() => r.patient && onOpen(r.patient.id)} className="flex min-h-24 flex-col justify-start rounded border border-rule bg-sheet p-2 text-left text-xs hover:bg-paper disabled:border-dashed disabled:bg-transparent disabled:text-ink-faint">
      <div className="flex w-full items-baseline gap-1.5"><b className="text-sm">{r.bed}</b>{r.patient ? <><span className="truncate text-sm">{r.patient.name}</span><span className="ml-auto shrink-0 text-ink-faint">{r.patient.age}{r.patient.sex}・{r.days}日目</span></> : <span>空床</span>}</div>
      {r.patient && <>
        <div className="mt-0.5 truncate text-ink-soft">{r.diagnosis}</div>
        <div className="mt-1 flex flex-wrap gap-1">{r.vent && <span className={chip}>{r.vent.split(" ")[0]}</span>}{r.infusions.map((inf,i) => <span key={i} className={chip}>{shortDrug(inf)}</span>)}{r.crrt && <span className={chip}>{r.crrt.split(" ")[0]}</span>}</div>
        {r.planned && <div className="mt-1 text-ai">→ {r.planned.to} {r.planned.day === 1 ? "明日" : r.planned.day === 0 ? "今日" : `${r.planned.day}日後`} {r.planned.time}</div>}
      </>}
    </button>)}</div>
  </section>;
}
