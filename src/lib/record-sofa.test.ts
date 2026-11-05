import { describe, expect, it } from "vitest";
import { PATIENTS } from "./patients";
import { emergencyPrefill, icuPrefill, SOFA_ITEMS, sofaTotal } from "./record-sofa";
import { BUILTIN_RECORD_TEMPLATES, buildRecord, recordProblems, startRecordValues, type RecordFacts } from "./record-templates";
const facts: RecordFacts = { patient: { ...PATIENTS[0], labs: [{ day: 0, time: "09:00", values: { Plt: 10, "T-Bil": 2, Cre: 3, Hb: 8 } }, { day: 1, time: "09:00", values: { Plt: 99 } }], vitals: [{ day: 0, time: "08:00", sbp: 88, spo2: 91 }] }, today: { y: 2026, m: 11, d: 4 }, nowTime: "10:00", me: { name: "担当医", role: "医師" } };
describe("ICU の SOFA と数値の引用", () => {
  it("空欄を0とせず6項目の合計だけを計算し、変更に追従する", () => {
    expect(sofaTotal({})).toBeNull();
    const values = Object.fromEntries(SOFA_ITEMS.map((s, i) => [`選択:SOFA ${s}`, String(i % 5)]));
    expect(sofaTotal(values)).toBe(10);
    expect(sofaTotal({ ...values, "選択:SOFA 呼吸 P/F": "4" })).toBe(14);
    expect(sofaTotal({ ...values, "選択:SOFA 呼吸 P/F": "5" })).toBeNull();
    const t = BUILTIN_RECORD_TEMPLATES.find((t) => t.id === "rec-icu-admit")!;
    expect(buildRecord(t, values, facts)).toContain("SOFA 合計：10点");
    expect(recordProblems(t, startRecordValues(t, facts))).toContain("「入室の理由」を書いてください");
  });
  it("血小板は万/μLを換算し、未測定・将来値・陰性値は点数を作らない", () => {
    const v = icuPrefill(facts);
    expect(v["選択:SOFA 凝固 Plt"]).toBe("2");
    expect(v["選択:SOFA 肝 Bil"]).toBe("2");
    expect(v["選択:SOFA 腎 Cre/尿量"]).toBeUndefined();
    expect(v["選択:SOFA 循環 MAP/昇圧薬"]).toBeUndefined();
    for (const [plt, expected] of [[15.1, "0"], [15, "1"], [10, "2"], [5, "3"], [2, "4"]] as const) {
      expect(icuPrefill({ ...facts, patient: { ...facts.patient, labs: [{ day: 0, time: "09:00", values: { Plt: plt } }] } })["選択:SOFA 凝固 Plt"]).toBe(expected);
    }
    expect(icuPrefill({ ...facts, patient: { ...facts.patient, labs: [] } })["選択:SOFA 凝固 Plt"]).toBeUndefined();
  });
  it("救急の初期値は測定時刻つきで血圧・SpO2・最新の検査を引用しJCSを推測しない", () => {
    const text = emergencyPrefill(facts);
    expect(text).toContain("収縮期血圧 88mmHg（今日 08:00）");
    expect(text).toContain("SpO2 91%");
    expect(text).toContain("Hb 8");
    expect(text).not.toContain("JCS");
    expect(text).not.toContain("Plt 99");
  });
});
