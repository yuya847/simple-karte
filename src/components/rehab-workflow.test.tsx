import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MeProvider, RoleProvider } from "./RoleContext";
import { STAFF } from "@/lib/roles";
import { SCENARIOS } from "@/lib/scenarios";
import { EMPTY_REHAB, rehabPrescriptions } from "@/lib/rehab";
import { ordersOf } from "@/lib/record";
import { RehabProgressPanel } from "./panels/RehabProgressPanel";
import { RehabConference } from "./RehabConference";
const people = SCENARIOS.cases.filter(c => c.stage === "入院").map(({patient}) => ({patient, room: patient.room, entries: ordersOf(patient.history)}));
const asTherapist = (node: React.ReactNode) => renderToStaticMarkup(<RoleProvider value="療法士"><MeProvider value={STAFF.療法士}>{node}</MeProvider></RoleProvider>);
it("療法士が処方のあるカルテで実施・BI・FIM・計画書を入力できる", () => {
  const rx = rehabPrescriptions(people)[0]; const p = people.find(p => p.patient.id === rx.patientId)!;
  const html = asTherapist(<RehabProgressPanel patient={p.patient} entries={p.entries} desk={EMPTY_REHAB} onDesk={() => {}} onNote={() => {}} nowTime="10:00" today={{y:2026,m:11,d:6}} />);
  for (const text of ["実施を記録", "実施の分", "Barthel Index", "FIM", "歩行", "移乗", "計画書"]) expect(html).toContain(text);
});
it("カンファレンスは患者・時刻・参加者・目標・方針を記録する", () => {
  const html = asTherapist(<RehabConference rxs={rehabPrescriptions(people)} nowTime="14:00" onNote={() => {}} />);
  for (const text of ["カンファレンスの患者", "時刻", "参加者", "目標", "方針", "カンファレンスを記録"]) expect(html).toContain(text);
});
