import { describe, expect, it } from "vitest";
import { news2 } from "./news2";

describe("NEWS2（RCP 2017）", () => {
  it("all normal → 0, 12時間ごと", () => {
    const n = news2({ rr: 16, spo2: 97, o2: "室内気", sbp: 120, hr: 70, bt: 36.8, avpu: "A" });
    expect(n.total).toBe(0);
    expect(n.monitoring).toBe("少なくとも12時間ごと");
  });
  it("大浦さんの入院時（RR 24・SpO2 92・室内気・SBP 138・HR 102・BT 38.3・A）= 2+2+0+0+1+0+1 = 6 → 中", () => {
    const n = news2({ rr: 24, spo2: 92, o2: "室内気", sbp: 138, hr: 102, bt: 38.3, avpu: "A" });
    expect(n.parts.map((p) => p.score)).toEqual([2, 2, 0, 0, 1, 0, 1]);
    expect(n.total).toBe(6);
    expect(n.risk).toBe("中");
  });
  it("酸素を使っていたら2点、1項目が3点なら低〜中で1時間ごと", () => {
    const n = news2({ rr: 18, spo2: 96, o2: "鼻カニュラ 2L", sbp: 88, hr: 80, bt: 36.5, avpu: "A" });
    expect(n.total).toBe(5); // 酸素2 + SBP 3
    const m = news2({ rr: 18, spo2: 96, o2: "室内気", sbp: 88, hr: 80, bt: 36.5, avpu: "A" });
    expect(m).toMatchObject({ total: 3, red: true, risk: "低〜中", monitoring: "少なくとも1時間ごと" });
  });
  it("境界：体温 35.0 → 3、36.0 → 1、38.0 → 0、39.0 → 1、39.1 → 2", () => {
    const t = (bt: number) => news2({ bt }).parts.find((p) => p.name === "体温")!.score;
    expect([t(35.0), t(36.0), t(38.0), t(39.0), t(39.1)]).toEqual([3, 1, 0, 1, 2]);
  });
  it("測っていない項目は missing に出す", () => {
    expect(news2({ hr: 80 }).missing).toEqual(["呼吸数", "SpO2", "収縮期血圧", "意識", "体温"]);
  });
});
