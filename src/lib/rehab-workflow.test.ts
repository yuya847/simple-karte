import { describe, expect, it } from "vitest";
import { scenarioRehabBookings, wardRehabDesk, restoreScenarioRehabDesk } from "./rehab-workflow";
import { EMPTY_REHAB, rehabPrescriptions } from "./rehab";
import { SCENARIOS } from "./scenarios";
import { ordersOf } from "./record";
import { workspaceRecords } from "./workspace-records";
const people = SCENARIOS.cases.filter(c => c.stage === "入院").map(({patient}) => ({patient, room: patient.room, entries: ordersOf(patient.history)}));
describe("療法士の病棟記録", () => {
  it("試験病棟の処方から予定を作り、患者と処方の組が一致する", () => {
    const bookings = scenarioRehabBookings(people);
    const rxs = rehabPrescriptions(people);
    expect(bookings.length).toBeGreaterThan(0);
    for (const b of bookings) expect(rxs.some(r => r.patientId === b.patientId && r.orderId === b.orderId)).toBe(true);
    expect(wardRehabDesk({...EMPTY_REHAB, bookings}, people).bookings).toEqual(bookings);
    expect(wardRehabDesk({...EMPTY_REHAB, bookings}, []).bookings).toEqual([]);
  });
  it("古い保存の職種・自分・表示・患者タブを取り込まず、記録だけを保存する", () => {
    const remote = {role: "管理栄養士", me: "高橋", area: "ward", patientTabs: ["other"], front: {}, wardTabs: [], notes: {a: ["記録"]}};
    expect(workspaceRecords(remote)).toEqual({notes: {a: ["記録"]}});
    expect(workspaceRecords(workspaceRecords(remote))).toEqual(workspaceRecords(remote));
  });
});

it("短期入院の脳梗塞に翌日の退院を一律に付けない", () => {
  const strokes = people.filter(x => /脳梗塞/.test(x.patient.admissionDiagnosis) && x.patient.admittedOn >= -4);
  for (const p of strokes) expect(p.entries.some(e => e.order.type === "procedure" && e.order.leave?.kind === "退院" && e.order.leave.from.day === 1)).toBe(false);
});
it("小児と妊婦は成人と相部屋にならない", () => {
  for (const c of SCENARIOS.cases.filter(c => c.patient.age < 18 || c.patient.pregnancy)) {
    expect(SCENARIOS.cases.filter(x => x.patient.room === c.patient.room && x.patient.ward === c.patient.ward)).toHaveLength(1);
    if (c.stage !== "救急") expect(SCENARIOS.beds.find(b => b.patientId === c.patient.id)?.specialty).toBe(c.patient.age < 18 ? "小児" : "産科");
  }
});

it("古い試験用の保存を読み戻しても現病棟の予定に直る", () => { const desk = restoreScenarioRehabDesk(EMPTY_REHAB, people); expect(desk.bookings.length).toBeGreaterThan(0); expect(restoreScenarioRehabDesk(desk, people)).toEqual(desk); });
