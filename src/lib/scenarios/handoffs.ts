import { handoffKey, type Handoff } from "../handoff";
import type { Patient } from "../types";
import { STAFF } from "../roles";
export function scenarioHandoffs(patients: Patient[]): Record<string, Handoff> {
  return Object.fromEntries(patients.filter(p => p.attending === STAFF.医師.name && !p.dischargedAt && p.admittedOn < 0).slice(0, 4).map((p, i) => {
    const h: Handoff = { id: `${p.id}-night-handoff`, patientId: p.id, role: "看護師", shift: "夜勤→日勤", shiftLo: 510, severity: i % 2 ? "要注意" : "安定", summary: `${p.admissionDiagnosis}で療養中。夜間の呼びかけに返答あり。`, actions: [{ text: ["朝食時のむせと摂取量を確認する", "移動時のふらつきを確認し付き添う", "点滴部位と残量を確認する", "仙骨部の皮膚と除圧の状態を確認する"][i] }], contingency: "呼吸や意識、痛みの変化があれば主治医へ連絡する。", facts: [], from: "夜勤看護師", sentAt: { day: 0, time: "08:20" } };
    return [handoffKey(p.id, 510, "看護師"), h];
  }));
}
