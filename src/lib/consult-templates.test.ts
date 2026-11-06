import { describe, expect, it } from "vitest";
import { CONSULT_TEMPLATES, templatesFor } from "./consult-templates";

describe("他科依頼のひな形", () => {
  const f = { diagnosis: "右下腿蜂巣炎", labs: "血液検査（11/6 06:00）\n炎症：CRP 8.2 mg/dL↑", vitals: null, dept: "皮膚科" };
  it("院内と院外で出し分け、主病名と直近の検査が入る", () => {
    expect(templatesFor(false).map((t) => t.id)).not.toContain("referral");
    expect(templatesFor(true).map((t) => t.id)).toEqual(["sbar", "referral"]);
    const body = CONSULT_TEMPLATES[0].body(f);
    expect(body.startsWith("皮膚科 先生")).toBe(true);
    expect(body).toContain("【主病名】右下腿蜂巣炎");
    expect(body).toContain("CRP 8.2");
  });
});
