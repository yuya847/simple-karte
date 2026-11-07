"use client";

// 国のサービス（模擬）in the chart: the 退院時処方 as an 電子処方箋 (or 院内処方の情報), and the 3文書6情報 for the
// 電子カルテ情報共有サービス. オンライン資格確認 is in 医事課の「保険の登録」 and the 外来の受付.

import { Building2, Pill } from "lucide-react";
import { useState } from "react";
import { assumedInsurance } from "@/lib/billing/insurance";
import { currentInsurance, type InsuranceBook } from "@/lib/billing/registration";
import type { CalendarDate } from "@/lib/dates";
import type { Diagnosis } from "@/lib/diagnoses";
import type { DischargeDraft } from "@/lib/discharge";
import type { Letter } from "@/lib/letters";
import { birthDateOf } from "@/lib/national/fictional";
import { nextSerial, recordsOf, type NationalRecord } from "@/lib/national/log";
import { linesFromHomeRx } from "@/lib/national/rx-lines";
import type { OrderEntry, Patient } from "@/lib/types";
import { SubTabs } from "../DeskParts";
import { ClinsPanel } from "./ClinsPanel";
import { ErxPanel } from "./ErxPanel";

/** The patient's insurance as registered, or the age-based assumption (marked). */
export function insuranceFor(book: InsuranceBook, p: { id: string; age: number }, today: CalendarDate) {
  const ins = currentInsurance(book, p.id);
  return ins ? { insurance: ins, assumed: false } : { insurance: assumedInsurance(p.age, today), assumed: true };
}

/** The insurance and the birth date the FHIR documents carry (the card's, or the assumption's and a fictional day). */
export function clinsPatient(book: InsuranceBook, p: { id: string; age: number }, today: CalendarDate) {
  const { insurance, assumed } = insuranceFor(book, p, today);
  return { insurance, assumed, birthDate: insurance && !assumed ? insurance.birthDate : birthDateOf(p, today) };
}

export function NationalPanel({ patient, entries, diagnoses, draft, letters, book, today, nowTime, log, onRecord }: { patient: Patient; entries: OrderEntry[]; diagnoses: Diagnosis[]; draft?: DischargeDraft; letters: Letter[]; book: InsuranceBook; today: CalendarDate; nowTime: string; log: NationalRecord[]; onRecord: (r: NationalRecord) => void }) {
  const [tab, setTab] = useState<"erx" | "clins">("erx");
  const { insurance, assumed, birthDate } = clinsPatient(book, patient, today);
  const lines = linesFromHomeRx(entries);
  const mine = recordsOf(log, patient.id);
  return (
    <div className="space-y-3">
      <SubTabs
        label="国のサービス"
        tabs={[
          { key: "erx", label: "電子処方箋（退院時処方）", icon: Pill },
          { key: "clins", label: "電子カルテ情報共有サービス", icon: Building2 },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "erx" ? (
        <ErxPanel
          key={JSON.stringify(lines)}
          patient={{ id: patient.id, name: patient.name, kana: patient.kana, sex: patient.sex, birthDate }}
          patientKey={patient.id}
          department={patient.department}
          insurance={insurance}
          insuranceAssumed={assumed}
          lines={lines}
          today={today}
          nowTime={nowTime}
          mode="退院時"
          serial={nextSerial(log, today.y)}
          done={mine}
          onRegistered={onRecord}
        />
      ) : (
        <ClinsPanel patient={patient} birthDate={birthDate} insurance={insurance} insuranceAssumed={assumed} diagnoses={diagnoses} draft={draft} letters={letters} entries={entries} today={today} nowTime={nowTime} done={mine} onSent={onRecord} />
      )}
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >オンライン資格確認（模擬）は、医事課の「保険の登録」と外来の受付にあります。</p>
*/
