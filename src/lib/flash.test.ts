import { describe, expect, it } from "vitest";
import { FLASH_NEWS2_FROM, flashText, vitalsFlash } from "./flash";

describe("バイタルの確定のあとの手応え（flash）", () => {
  it("says what was recorded and that it is in 経過表, in the order BT HR BP RR SpO2, leaving out what was not typed", () => {
    const f = vitalsFlash({ day: 0, time: "20:52", bt: 37.2, hr: 88, sbp: 128, dbp: 76, rr: 18, spo2: 96, o2: "室内気", by: "看護師 佐藤" });
    expect(f.text).toBe("記録しました 20:52　BT 37.2 HR 88 BP 128/76 RR 18 SpO2 96%。経過表の行に入りました。");
    expect(f.warn).toBeUndefined();
    expect(vitalsFlash({ day: 0, time: "06:00", bt: 36.8 }).text).toBe("記録しました 06:00　BT 36.8。経過表の行に入りました。");
    // A measurement of another day names the day.
    expect(vitalsFlash({ day: -1, time: "22:00", hr: 70 }, "11/3（火）").text).toContain("記録しました 11/3（火） 22:00　HR 70");
  });
  it("adds 「NEWS2 N点」 as the warning (shown in 朱) from 5 points, the score's medium-risk trigger; below that no warning", () => {
    expect(FLASH_NEWS2_FROM).toBe(5);
    // RR 24 (2) + SpO2 93 (2) + on oxygen (2) + SBP 98 (2) + HR 104 (1) + BT 38.2 (1) = 10
    const high = vitalsFlash({ day: 0, time: "20:52", bt: 38.2, hr: 104, sbp: 98, dbp: 60, rr: 24, spo2: 93, o2: "鼻カニュラ 2L" });
    expect(high.warn).toBe("NEWS2 10点");
    // Exactly 5 warns; 4 does not (SpO2 93 on oxygen = 4; add RR 22 → 6).
    expect(vitalsFlash({ day: 0, time: "08:00", spo2: 93, o2: "鼻カニュラ 2L", rr: 16 }).warn).toBeUndefined();
    expect(vitalsFlash({ day: 0, time: "08:00", spo2: 93, o2: "鼻カニュラ 2L", rr: 16, hr: 95 }).warn).toBe("NEWS2 5点");
    expect(flashText(high)).toContain("　NEWS2 ");
    expect(vitalsFlash({ day: 0, time: "08:00", bt: 36.6, hr: 72, sbp: 124, dbp: 70, rr: 16, spo2: 97, o2: "室内気", avpu: "A" }).warn).toBeUndefined();
    expect(flashText("記事を確定しました。")).toBe("記事を確定しました。");
  });
});
