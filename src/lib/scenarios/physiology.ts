import type { Patient } from "../types";
import type { PhysioDesk } from "../physio-desk";

/** Orders and department work are generated together so every result has an owning order. */
export function addScenarioPhysiology(patients: Patient[]): PhysioDesk {
  const desk: PhysioDesk = {};
  const tests = ["PHY-ECG", "PHY-UCG", "PHY-SPIRO", "PHY-ABDUS"];
  patients.filter((p) => p.age >= 18 && !p.dischargedAt && p.admittedOn < 0).slice(0, 12).forEach((p, i) => {
    const test = tests[i % tests.length];
    const orderId = `${p.id}-physio`;
    p.history.push({ kind: "order", id: orderId, day: -1, time: "15:00", author: p.attending, status: "有効", order: { type: "physio", test, purpose: `${p.admissionDiagnosis}の経過確認`, when: { day: 0, time: "10:00", priority: "予約" }, place: "検査室", transport: "車椅子" } });
    const phase = Math.floor(i / 4);
    if (phase === 0) return;
    desk[orderId] = { orderId, patientId: p.id, test, arrived: { day: 0, time: "09:50", by: "検査技師 中村" }, done: { day: 0, time: "10:00", by: "検査技師 中村" } };
    if (phase === 2) {
      const values = test === "PHY-ECG" ? { HR: 74, PR: 160, QRS: 90, QT: 380, QTc: 422, AXIS: 45 } : test === "PHY-UCG" ? { LVDd: 47, LVDs: 30, IVSd: 9, LVPWd: 9, LAD: 34, LVEF: 64, Ee: 8, TRPG: 22, IVC: 14 } : test === "PHY-SPIRO" ? { VC: 3.1, pVC: 94, FVC: 3, FEV1: 2.4, pFEV1: 91 } : {};
      desk[orderId].report = { day: 0, time: "10:30", by: "検査技師 中村", values: values as Record<string, number>, findings: test === "PHY-ABDUS" ? "肝実質の輝度は均一。胆嚢結石・水腎症を認めない。" : test === "PHY-ECG" ? "洞調律。明らかなST変化を認めない。" : test === "PHY-UCG" ? "左室壁運動に明らかな局所異常を認めない。" : "再現性のある呼気曲線を取得。", conclusion: "検査を実施し所見を報告" };
    }
  });
  return desk;
}
