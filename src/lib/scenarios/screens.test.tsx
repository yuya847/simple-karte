import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from ".";
import { ordersOf } from "../record";
import { ROLES, STAFF, type Role } from "../roles";
import { RoleProvider, MeProvider } from "@/components/RoleContext";
import { HistoryPane } from "@/components/HistoryPane";
import { PharmacyView } from "@/components/PharmacyView";
import { LabView } from "@/components/LabView";
import { RadiologyView } from "@/components/RadiologyView";
import { RehabView } from "@/components/RehabView";
import { MealsView } from "@/components/MealsView";
import { SupportBoard } from "@/components/SupportBoard";
import { IjiBoard } from "@/components/IjiBoard";
import { EMPTY_DESK } from "../lab-desk";
import { EMPTY_REHAB } from "../rehab";
import { DEFAULT_OPTIONS } from "../billing/model";
import { patientMonthPayload } from "../billing/payload";
const today = { y: 2026, m: 11, d: 6 };
const noop = () => {};
const people = SCENARIOS.patients.map((patient) => ({ patient, room: patient.room, entries: ordersOf(patient.history) }));

function screen(role: Role, n: number) {
  const person = people[n];
  const list = [person];
  const common = { people: list, today, nowTime: "12:00" };
  switch (role) {
    case "医師": case "看護師": case "デバッグ": return <HistoryPane patient={person.patient} entries={person.patient.history} today={today} selectedDay={null} showStopped={false} onToggleStopped={noop} />;
    case "薬剤師": return <PharmacyView {...common} audited={{}} onAudit={noop} queries={[]} onAsk={noop} reports={[]} onReport={noop} shido={{}} onShido={noop} dispensed={{}} txIssued={{}} journal={[]} onJournal={noop} homeRx={{}} onHomeRx={noop} onDispense={noop} oralRx={{}} onOralRx={noop} tdm={[]} onTdm={noop} narcBook={{ ledger: [], slips: [], accidents: [], signed: {} }} onNarcBook={noop} newId={() => "render-only"} />;
    case "臨床検査技師": return <LabView people={list} items={[]} calls={{}} acks={{}} limits={[]} limitsSource="" nowTime="12:00" attending={person.patient.attending} onCall={noop} records={{}} sessionStart={720} desk={EMPTY_DESK} onDesk={noop} />;
    case "診療放射線技師": return <RadiologyView {...common} desk={{}} onDesk={noop} acks={{}} />;
    case "療法士": return <RehabView {...common} desk={EMPTY_REHAB} onDesk={noop} />;
    case "管理栄養士": return <MealsView {...common} title="病棟の食事" diets={SCENARIOS.diets} />;
    case "MSW": return <SupportBoard people={list} evals={{}} documents={[]} asks={SCENARIOS.asks} today={today} discharged={SCENARIOS.discharged} onOpen={noop} onStep={noop} />;
    case "医事課": return <IjiBoard patients={[person.patient]} desk={{ insurance: SCENARIOS.insurance, settled: {} }} diagnoses={SCENARIOS.diagnoses} today={today} nowTime="12:00" payload={() => [patientMonthPayload(person.patient, person.patient.history, SCENARIOS.diagnoses[person.patient.id], DEFAULT_OPTIONS)]} onOpen={noop} />;
  }
}

describe("各職種の主画面を100人それぞれで開く", () => {
  it.each(ROLES)("%s", (role) => {
    for (let n = 0; n < people.length; n++) {
      const html = renderToStaticMarkup(<RoleProvider value={role}><MeProvider value={STAFF[role]}>{screen(role, n)}</MeProvider></RoleProvider>);
      expect(html, `${role}: ${people[n].patient.id}`).toBeTruthy();
    }
  }, 15000);
});
