"use client";

import type { OrderEntry } from "@/lib/types";
import type { OpdPatient } from "@/lib/opd";
import type { OpdRx } from "./OpdOrders";
import { outsidePrescriptionLines } from "@/lib/billing/opd-visit";
import type { IjiDesk } from "@/lib/billing/worklist";
import { insuranceFor } from "./national/NationalPanel";
import { birthDateOf } from "@/lib/patient-contacts";
import { isoDate, type CalendarDate } from "@/lib/dates";
import { nextSerial, recordsOf, type NationalRecord } from "@/lib/national/log";
import { ErxPanel } from "./national/ErxPanel";

export function OpdRxAfter({ op, entries, legacy, insuranceBook, today, nowTime, national, onRegistered }: { op: OpdPatient; entries: OrderEntry[]; legacy: OpdRx[]; insuranceBook: IjiDesk["insurance"]; today: CalendarDate; nowTime: string; national: NationalRecord[]; onRegistered: (r: NationalRecord) => void }) {
  const items = outsidePrescriptionLines(entries, legacy);
  const { insurance, assumed } = insuranceFor(insuranceBook, { id: `opd:${op.id}`, age: op.age }, today);
  return <section className="mt-4 border-t border-rule pt-3" aria-label="確定後の電子処方箋">
    <h3 className="mb-2 text-sm font-bold">確定後の電子処方箋（模擬）</h3>
    <ErxPanel key={JSON.stringify(items)} patient={{ id: op.id, name: op.name, kana: op.kana, sex: op.sex, birthDate: insurance.birthDate || isoDate(birthDateOf(op, today)) }} patientKey={op.id} department={op.department} insurance={insurance} insuranceAssumed={assumed} lines={items} today={today} nowTime={nowTime} mode="外来" serial={nextSerial(national, today.y)} done={recordsOf(national, op.id)} onRegistered={onRegistered} />
  </section>;
}
