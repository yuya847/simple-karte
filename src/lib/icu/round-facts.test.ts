import { describe, expect, it } from "vitest";
import { icuRoundValues, ventSettingText } from "./round-facts";
import { icuFixture, icuPatient } from "./test-fixture";
import { emptyIcuRecords } from "./types";
import { BUILTIN_RECORD_TEMPLATES, buildRecord, startRecordValues, type RecordFacts } from "../record-templates";

describe("ICU 回診のテンプレートに貼る値", () => {
  it("SOFA の今日・昨日と内訳、P/F、呼吸器、持続投与、出納、ライン、RASS", () => {
    const r = icuFixture();
    r.hourly[8].rass = -2;
    const v = icuRoundValues(icuPatient, r, 600);
    expect(v["文:SOFA 今日"]).toBe("4点（推定を含む：腎）");
    expect(v["文:SOFA 昨日"]).toBe("");
    expect(v["文:SOFA の内訳"]).toBe("呼吸 0・凝固 0・肝 0・循環 4・中枢神経 0・腎 0");
    expect(v["文:P/F"]).toBe("400（PaO2 160 ÷ FiO2 0.4、今日 08:00）");
    expect(v["文:呼吸器"]).toBe("A/C-PC FiO2 0.4 PEEP 8");
    expect(v["文:持続投与"]).toBe("ノルアドレナリン 0.12γ・4.9mL/時");
    expect(v["文:出納"]).toBe("IN 54mL／OUT 330mL／差 -276mL（今日 0〜10時の記録分）");
    expect(v["文:ライン"]).toBe("CVC 右内頸（3日目）");
    expect(v["文:RASS"]).toBe("-2（今日 08:00）");
  });
  it("記録がない値は空欄（判定・勧めは書かない）", () => {
    const v = icuRoundValues({ ...icuPatient, labs: [], vitals: [] }, emptyIcuRecords(), 600);
    expect(Object.values(v).every((x) => x === "")).toBe(true);
  });
  it("呼吸器の設定の文：mode なしは器具と流量", () => {
    expect(ventSettingText({ mode: "HFNC", airway: "鼻カニュラ", fio2: 0.4, flow: 40 })).toBe("HFNC FiO2 0.4 40L/分");
    expect(ventSettingText({ mode: "なし", airway: "鼻カニュラ", fio2: 0.28, flow: 2 })).toBe("鼻カニュラ 2L/分 FiO2 0.28");
  });
  it("テンプレート「ICU 回診」は FAST HUG の7項目を並べ、カルテの値が入る", () => {
    const t = BUILTIN_RECORD_TEMPLATES.find((x) => x.id === "rec-icu-round")!;
    const facts: RecordFacts = { patient: icuPatient, today: { y: 2026, m: 11, d: 7 }, nowTime: "10:00", me: { name: "架空医師", role: "医師" }, icu: { records: icuFixture(), nowAbs: 600 } };
    const text = buildRecord(t, startRecordValues(t, facts), facts);
    for (const x of ["【ICU 回診】", "SOFA：今日 4点", "呼吸器：A/C-PC FiO2 0.4 PEEP 8", "持続投与：ノルアドレナリン 0.12γ・4.9mL/時", "栄養（Feeding）", "鎮痛（Analgesia）", "鎮静（Sedation）", "血栓予防（Thromboembolic prophylaxis）", "頭部挙上（Head-of-bed elevation）", "ストレス潰瘍予防（stress Ulcer prevention）", "血糖（Glucose control）"]) expect(text).toContain(x);
  });
});
