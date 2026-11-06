"use client";
import { VitalsPanel } from "./panels/VitalsPanel";
import { IoEntryForm } from "./IoPanel";
import { CareSheet } from "./CareSheet";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { dayTime, ioTimeFor, type FlowEntry } from "@/lib/flow-entry";
import { abs } from "@/lib/flowsheet";
import type { OrderEntry, Patient, VitalSign } from "@/lib/types";
import type { FlowSheetProps } from "./FlowSheet";
export function FlowInlineEntry({ req, patient, entries, today, nowTime, care, io, onSaveVital, onClose }: { req: FlowEntry; patient: Patient; entries: OrderEntry[]; today: CalendarDate; nowTime: string; care: FlowSheetProps["care"]; io: FlowSheetProps["io"]; onSaveVital?: (v: VitalSign) => void; onClose: () => void }) {
  return <div className="sticky left-0 z-10 max-w-3xl rounded border border-ai bg-sheet p-3 text-xs print:hidden" onClick={e => e.stopPropagation()}>
    <div className="mb-2 flex justify-between"><b>{req.kind === "vitals" ? "バイタル" : req.kind === "io" ? "食事・水分出納・排泄" : req.kind === "care" ? req.item : "記録"}</b><button type="button" className="rounded border border-rule px-2 py-1" onClick={onClose}>閉じる</button></div>
    {req.kind === "vitals" && onSaveVital && <VitalsPanel manualOnly nowTime={nowTime} defaultAt={dayTime(req.at)} fmtDay={d => formatShort(addDays(today, d))} onSave={v => { onSaveVital(v); onClose(); }} />}
    {req.kind === "io" && io?.onAdd && <IoEntryForm patientId={patient.id} nowTime={nowTime} defaultTime={ioTimeFor(req.at, abs(0, nowTime))} newId={() => crypto.randomUUID()} onAdd={io.onAdd} />}
    {req.kind === "care" && care?.onRecord && care.onVoid && <CareSheet people={[{ patient, entries, room: patient.room }]} orders={care.orders.filter(o => o.item === req.item)} records={care.records} plans={[]} lo={req.lo} hi={req.hi} day={Math.floor(req.lo / 1440)} today={today} nowTime={nowTime} sessionStart={care.sessionStart} interactive onRecord={care.onRecord} onVoid={care.onVoid} />}
  </div>;
}
