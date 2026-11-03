import { describe, expect, it } from "vitest";
import { PRESCRIPTIONS } from "./prescriptions";
import { PAST_RX, patternLine, patternsOf, previousOf } from "./rx-memory";

describe("処方の記憶", () => {
  it("counts the doctor's own Rp, most used first, with Rp of two drugs kept together", () => {
    const p = patternsOf(PAST_RX);
    expect(p[0]).toMatchObject({ count: 10, times: "頓用", prn: "発熱時（38.5℃以上）", patients: 10 });
    expect(patternLine(p[0])).toBe("アセトアミノフェン錠500mg 1回1錠　頓用 発熱時（38.5℃以上）（1日3回まで）");
    const lox = p.find((x) => x.rows.length === 2)!;
    expect(lox).toMatchObject({ count: 4, times: 3, timing: "毎食後", days: 3, category: "臨時" });
    expect(patternLine(lox)).toBe("ロキソプロフェンNa錠60mg 1回1錠、レバミピド錠100mg 1回1錠　1日3回 毎食後　3日分　臨時");
  });

  it("gives this patient's previous prescriptions for Do, leaving out the drugs brought from home", () => {
    const prev = previousOf("90010198", PRESCRIPTIONS["90010198"]);
    // The 退院時処方 written today comes first (2 Rp), then the 定期 from 3 days ago.
    expect(prev).toHaveLength(3);
    expect(prev.slice(0, 2).every((p) => p.category === "退院時")).toBe(true);
    expect(patternLine(prev[2])).toBe("酸化マグネシウム錠330mg 1回1錠　1日2回 朝夕食後　7日分　定期");
  });
});
