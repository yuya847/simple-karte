import { expect, it } from "vitest";
import { PATIENTS } from "./patients";
import { requestKind, startSurgeryRequest, surgeryRequestText } from "./surgery-request";
it("患者の事実を引用し、未確認の術前事項を作らず、申込と同じ内容を記事に残す", () => {
  const p = { ...PATIENTS[0], dietNow: "絶食（手術前）" };
  const s = startSurgeryRequest(p, 600);
  expect(s).toMatchObject({ patientId: p.id, name: p.name, ward: p.ward, status: "申込", allergies: p.allergies, preop: { consent: "未確認", anticoagulant: "未確認", fasting: p.dietNow } });
  expect(surgeryRequestText({ ...s, procedure: "試験術式", start: "12:00" }, { y: 2026, m: 11, d: 6 })).toContain("【手術申込】");
  expect(surgeryRequestText(s, { y: 2026, m: 11, d: 6 })).toContain("11/7");
  expect(s.allergies).not.toBe(p.allergies);
});
it("前日15時の締切を過ぎた申込と当日の申込は締切後にする", () => {
  expect(requestKind(1, 900)).toBe("予定");
  expect(requestKind(1, 901)).toBe("締切後");
  expect(requestKind(0, 600)).toBe("締切後");
});
