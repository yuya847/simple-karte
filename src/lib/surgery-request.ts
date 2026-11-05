import { addDays, formatShort, minutesOf, type CalendarDate } from "./dates";
import { OR_RULES, type Surgery } from "./surgery";
import type { Patient } from "./types";

export function startSurgeryRequest(patient: Patient, nowAbs: number): Surgery {
  return { id: "", patientId: patient.id, name: patient.name, sex: patient.sex, age: patient.age, ward: patient.ward, department: patient.department,
    day: 1, room: "手術室1", start: null, minutes: 60, procedure: "", site: "", side: "なし", position: "仰臥位", anesthesia: null,
    laparoscopic: false, kind: "予定", blood: "血液型・不規則抗体", after: "病棟", anesthesiaConsult: false,
    infections: [...patient.infections], allergies: [...patient.allergies], heightCm: patient.heightCm, weightKg: patient.weightKg,
    status: "申込", requestedAt: nowAbs, surgeon: patient.attending, assistant: "", bloodUnits: 0, special: "",
    preop: { consent: "未確認", anticoagulant: "未確認", fasting: patient.dietNow?.includes("絶食") ? patient.dietNow : "未確認", bloodType: patient.blood ? `${patient.blood.abo} Rh${patient.blood.rh}（照合 ${patient.blood.checks}回）` : "未確認" } };
}
export function requestKind(day: number, nowAbs: number): Surgery["kind"] {
  return day === 0 || nowAbs > (day - 1) * 1440 + minutesOf(OR_RULES.deadline) ? "締切後" : "予定";
}
export function surgeryRequestText(s: Surgery, today: CalendarDate): string {
  return ["【手術申込】", `${s.name}（${s.sex}・${s.age}歳） ${s.ward} ${s.department}`,
    `予定：${formatShort(addDays(today, s.day))} ${s.start}／${s.room}／${s.minutes}分（${s.kind}・申込）`,
    `術式：${s.procedure}`, `部位・左右：${s.site}・${s.side}　体位：${s.position}　麻酔：${s.anesthesia}`,
    `執刀医：${s.surgeon}　助手：${s.assistant || "未入力"}`,
    `同意書：${s.preop?.consent}　感染症：${s.infections.join("、") || "登録なし（要確認）"}　アレルギー：${s.allergies.join("、") || "登録なし（要確認）"}`,
    `抗凝固薬の中止：${s.preop?.anticoagulant}　血液型：${s.preop?.bloodType}`,
    `輸血の準備：${s.blood} ${s.bloodUnits ?? 0}単位　絶食の指示：${s.preop?.fasting}`, `特記：${s.special || "なし"}`].join("\n");
}
