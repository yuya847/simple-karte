import { describe, expect, it } from "vitest";
import { isLabPasteLine, isVitalsPasteLine, labItemText, labPasteText, latestLab, vitalsPasteText } from "./lab-paste";
import type { LabResult } from "./types";

const today = { y: 2026, m: 11, d: 5 };

describe("LD で直近の血液検査を貼る", () => {
  it("LD・ld・;LD の行だけに反応する", () => {
    expect(isLabPasteLine("LD")).toBe(true);
    expect(isLabPasteLine("  ;ld ")).toBe(true);
    expect(isLabPasteLine("ＬＤ")).toBe(true);
    expect(isLabPasteLine("LDH")).toBe(false);
    expect(isLabPasteLine("LD 240")).toBe(false);
  });
  it("基準範囲から外れる値に ↑↓ を付け、千の位に区切りを入れる", () => {
    expect(labItemText("WBC", 10900, "男")).toBe("WBC 10,900 /μL↑");
    expect(labItemText("Hb", 12.4, "男")).toBe("Hb 12.4 g/dL↓");
    expect(labItemText("Hb", 12.4, "女")).toBe("Hb 12.4 g/dL");
    expect(labItemText("CRP", 0.1, "男")).toBe("CRP 0.1 mg/dL");
  });
  it("直近の 1 回分を血算・凝固・生化学・炎症の順に、日付と時刻つきで組む", () => {
    const labs: LabResult[] = [
      { day: -3, time: "06:00", values: { WBC: 15000, CRP: 12 } },
      { day: 0, time: "06:00", values: { Cre: 1.1, Hb: 12.4, WBC: 10900, Plt: 19.6, CRP: 8.2, Na: 138, K: 4.0, AST: 32, "PT-INR": 1.1 } },
    ];
    expect(latestLab(labs)?.day).toBe(0);
    const t = labPasteText({ labs, sex: "男" }, today)!;
    expect(t.split("\n")[0]).toBe("血液検査（11/5（木） 06:00）");
    expect(t).toContain("血算：WBC 10,900 /μL↑、Hb 12.4 g/dL↓、Plt 19.6 万/μL");
    expect(t).toContain("凝固：PT-INR 1.1");
    expect(t).toContain("生化学：AST 32 U/L↑、Cre 1.1 mg/dL↑、Na 138 mmol/L、K 4 mmol/L");
    expect(t).toContain("炎症：CRP 8.2 mg/dL↑");
    expect(t.indexOf("血算")).toBeLessThan(t.indexOf("生化学"));
  });
  it("結果が無ければ null", () => {
    expect(labPasteText({ labs: [], sex: "女" }, today)).toBeNull();
  });
});

describe("ばいたる で直近のバイタルを貼る", () => {
  it("ばいたる・バイタル・VS の行だけに反応する", () => {
    expect(isVitalsPasteLine("ばいたる")).toBe(true);
    expect(isVitalsPasteLine(";バイタル")).toBe(true);
    expect(isVitalsPasteLine("VS")).toBe(true);
    expect(isVitalsPasteLine("バイタル測定")).toBe(false);
  });
  it("直近の 1 回を JCS/意識・BT・BP・HR・RR・SpO2（酸素）の順に", () => {
    const vitals = [
      { day: -1, time: "18:00", bt: 37.0, hr: 80, sbp: 120, dbp: 70, rr: 16, spo2: 97 },
      { day: 0, time: "11:32", bt: 38.2, hr: 118, sbp: 92, dbp: 54, rr: 26, spo2: 90, o2: "鼻カニュラ 2L", avpu: "V" as const },
    ];
    expect(vitalsPasteText({ vitals }, today)).toBe("バイタル（11/5（木） 11:32）：意識 声に反応（V）、BT 38.2℃、BP 92/54 mmHg、HR 118 /分、RR 26 /分、SpO2 90%（鼻カニュラ 2L）");
    expect(vitalsPasteText({ vitals: [] }, today)).toBeNull();
  });
});
