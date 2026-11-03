import { describe, expect, it } from "vitest";
import { DOC_DEFS, docMissing, stayDays } from "./documents";

describe("書類作成", () => {
  it("asks only for what the doctor writes", () => {
    expect(docMissing("退院証明書", {})).toEqual(["退院時の状況"]);
    expect(docMissing("入院診療計画書", { symptoms: "発熱", treatment: "抗菌薬", tests: "採血", days: "10", nutrition: "無", explainedTo: "本人" })).toEqual([]);
  });
  it("counts the stay from the admission day", () => {
    expect(stayDays(-5, 2)).toBe(8);
  });
  it("fills the chart's facts by code", () => {
    expect(DOC_DEFS.退院証明書.fields.filter((f) => f.auto).map((f) => f.key)).toEqual(["name", "admitted", "discharge", "stay", "diagnosis", "fee"]);
  });
});
