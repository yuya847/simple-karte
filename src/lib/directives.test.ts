import { describe, expect, it } from "vitest";
import { INITIAL_DIRECTIVES, bandLabel, current, directiveLine, emptyItems, reviewDue, type AdvanceDirective } from "./directives";

describe("事前指示", () => {
  const d = INITIAL_DIRECTIVES[0];
  it("band and line", () => {
    expect(bandLabel(d)).toBe("DNAR");
    expect(bandLabel(undefined)).toBe("未確認");
    expect(directiveLine(d)).toBe("心肺蘇生：行わない（DNAR）、気管挿管・人工呼吸：行わない、透析：行わない、輸血：行う（長女（キーパーソン、架空）と話し合い）");
  });
  it("the newest valid one is current; review day", () => {
    const newer: AdvanceDirective = { ...d, id: "x", cpr: "行う", items: emptyItems(), reviewOn: undefined };
    expect(current([d, newer], d.patientId)?.id).toBe("x");
    expect(current([d, { ...newer, status: "取消" }], d.patientId)?.id).toBe(d.id);
    expect(reviewDue(d, 5)).toBe(false);
    expect(reviewDue(d, 6)).toBe(true);
  });
});
