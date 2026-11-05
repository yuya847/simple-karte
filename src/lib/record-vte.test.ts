import { describe, expect, it } from "vitest";
import { PATIENTS } from "./patients";
import { PADUA_ITEMS, paduaText, paduaTotal, vtePrefill } from "./record-vte";
import { BUILTIN_RECORD_TEMPLATES, buildRecord, startRecordValues } from "./record-templates";
import { templateOptions, matchesTemplate } from "./record-filter";
import { emptyStanding } from "./standing";
const facts = { patient: PATIENTS[0], today: { y: 2026, m: 11, d: 6 }, nowTime: "10:00", me: { name: "評価者", role: "医師" as const } };
const no = Object.fromEntries(PADUA_ITEMS.map(([label]) => [`選択:Padua ${label}`, "なし"]));
describe("Padua", () => {
  it("全11項目が揃うまで未計算とし、配点と4点の境界を計算する", () => {
    expect(paduaTotal({})).toBeNull();
    expect(paduaTotal(no)).toBe(0);
    expect(paduaTotal({ ...no, "選択:Padua 活動性癌": ["あり"] })).toBeNull();
    for (const [label, points] of PADUA_ITEMS) expect(paduaTotal({ ...no, [`選択:Padua ${label}`]: "あり" })).toBe(points);
    expect(paduaTotal(Object.fromEntries(PADUA_ITEMS.map(([label]) => [`選択:Padua ${label}`, "あり"])))).toBe(20);
    expect(paduaText({ ...no, "選択:Padua 活動性癌": "あり" })).toContain("3点（4点未満）");
    expect(paduaText({ ...no, "選択:Padua 活動性癌": "あり", "選択:Padua 70歳以上": "あり" })).toContain("4点（高リスク）");
    expect(paduaTotal({ ...no, "選択:Padua 活動性癌": "不明" })).toBeNull();
  });
  it("年齢・BMIの境界と入院病名だけを引用し、慢性感染症や記載なしを陰性としない", () => {
    const p = { ...facts.patient, age: 70, heightCm: 200, weightKg: 120, admissionDiagnosis: "急性心不全・肺炎" };
    const v = vtePrefill({ ...facts, patient: p });
    expect(v).toMatchObject({ "文:評価者": "評価者", "選択:Padua 70歳以上": "あり", "選択:Padua BMI 30以上": "あり", "選択:Padua 心不全か呼吸不全": "あり", "選択:Padua 急性感染症かリウマチ性疾患": "あり" });
    const unknown = vtePrefill({ ...facts, patient: { ...p, age: 69, heightCm: 0, admissionDiagnosis: "心不全疑い", infections: ["HBV"] } });
    expect(unknown["選択:Padua 70歳以上"]).toBe("なし");
    for (const key of ["BMI 30以上", "心不全か呼吸不全", "急性感染症かリウマチ性疾患", "VTE の既往"]) expect(unknown[`選択:Padua ${key}`]).toBeUndefined();
  });
  it("ベッド上は期間確認を促し、終了済み指示からは引用しない", () => {
    const standing = { ...emptyStanding("医師", { day: -4, time: "09:00" }), rest: "ベッド上" as const };
    const v = vtePrefill({ ...facts, standing });
    expect(v["文:臥床の確認"]).toContain("3日以上");
    expect(v["選択:Padua 臥床（3日以上）"]).toBeUndefined();
    expect(vtePrefill({ ...facts, standing: { ...standing, until: -1 } })["文:臥床の確認"]).toBeUndefined();
  });
  it("テンプレートの記録に計算を残すが予防法を自動選択しない", () => {
    const t = BUILTIN_RECORD_TEMPLATES.find((t) => t.id === "rec-vte")!;
    expect(t.roles).toEqual(["医師", "看護師"]);
    expect(buildRecord(t, no, facts)).toContain("Padua 合計：0点");
    const values = startRecordValues(t, facts);
    expect(values["選択:リスクレベル"]).toBeFalsy();
    expect(values["複数:予防の実施状況"]).toBeFalsy();
    expect(t.hint).toContain("決めるのは医師");
    const note = { kind: "note" as const, day: 0, time: "10:00", author: facts.me.name, role: "医師" as const, text: buildRecord(t, no, facts), templateId: t.id, templateName: t.name };
    expect(templateOptions([note], BUILTIN_RECORD_TEMPLATES)).toEqual([{ id: t.id, name: t.name, count: 1 }]);
    expect(matchesTemplate(note, BUILTIN_RECORD_TEMPLATES, ["rec-vte"], true)).toBe(true);
  });
});
