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
  const show = (n: number | null | undefined) => n ?? "—";
  return <section className="space-y-3 p-4" aria-label="ICU・HCU">
    <TabChoice label="病棟" options={[{ value:"ICU",label:"ICU" },{ value:"HCU",label:"HCU" }]} value={unit} onChange={setUnit}/>
    <div className="grid grid-cols-2 gap-2">{rows.map(r => <button key={r.bed} disabled={!r.patient} onClick={() => r.patient && onOpen(r.patient.id)} className="min-h-44 rounded border border-rule bg-sheet p-3 text-left text-xs leading-relaxed hover:bg-paper disabled:text-ink/40">
      <div className="text-sm"><b>{r.bed}</b>　{r.patient ? <>{r.patient.name}　{r.patient.age}歳{r.patient.sex}　入室 {r.days} 日目</> : "空床"}</div>
      {r.patient && <><div>{r.diagnosis}</div><div>{r.vent}</div>{r.infusions.map((inf,i) => <div key={i}>{inf}</div>)}{r.crrt && <div>{r.crrt}</div>}
        <div>SOFA 今日 {show(r.sofaToday)}（昨日 {show(r.sofaYesterday)}）</div>
        <div>{r.lines.map((l,i) => <span key={i}>{i > 0 && "・"}{l.flag ? <strong>{l.kind} {l.days}</strong> : `${l.kind} ${l.days}`}</span>)}</div>
        <div>24h IN {Math.round(r.balance24h!.inMl)} / OUT {Math.round(r.balance24h!.outMl)} / 差 {Math.round(r.balance24h!.netMl)} mL</div>
        <div>HR {show(r.latest?.hr)}　MAP {show(r.latest?.map)}　SpO2 {show(r.latest?.spo2)}　RR {show(r.latest?.rr)}　BT {show(r.latest?.bt)}　RASS {show(r.latest?.rass)}</div>
        {r.planned && <div>{r.planned.day === 1 ? "明日" : r.planned.day === 0 ? "今日" : `${r.planned.day}日後`} {r.planned.time} → {r.planned.to}</div>}
      </>}
    </button>)}</div>
  </section>;
}
