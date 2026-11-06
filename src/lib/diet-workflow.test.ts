import { describe, expect, it } from "vitest";
import { INITIAL_DIETS, dietAt, dietNutrients, type DietOrder } from "./diet";
import { attendingDesk, dietAdjustment, dietNeedsProposal, dietProposal, dietProposalCount } from "./diet-workflow";
const current = INITIAL_DIETS[0];
describe("管理栄養士の食事の調整と提案", () => {
  it("主食・禁止・補食・アレルギーだけは直接反映できる", () => {
    const next = { ...current, id: "new", staple: "全粥", prohibited: "卵", supplement: "ゼリー", allergyNote: "卵", from: { day: 1, meal: "昼" }, by: "管理栄養士" } as DietOrder;
    expect(dietNeedsProposal(current, next)).toBe(false);
    expect(dietAdjustment(current, next)).toMatchObject({ staple: "全粥", prohibited: "卵", supplement: "ゼリー", allergyNote: "卵", by: "管理栄養士", kind: "常食" });
  });
  it.each([{ kind: "治療食", therapeutic: "TD-KIDNEY" }, { energyKcal: 1200 }, { proteinG: 40 }, { side: "刻み" }, { thickness: "薄いとろみ" }, { comment: "変更" }])("食種や栄養量などは主治医の確定を待つ %o", patch => {
    const next = { ...current, ...patch } as DietOrder;
    expect(dietNeedsProposal(current, next)).toBe(true);
    expect(dietAdjustment(current, next)).toEqual(current);
    const draft = dietProposal(next, "proposal");
    expect(draft.sourceText).toMatch(/^食事の変更の提案：/);
    expect(dietProposalCount([draft])).toBe(1);
    expect(dietAt([current], current.patientId, 1, "昼")).toEqual(current);
    expect(draft.diet.kind).toBe(next.kind);
  });
  it("指示なしは提案にし、主治医の机に振り分ける", () => {
    expect(dietNeedsProposal(undefined, current)).toBe(true);
    expect(attendingDesk("山本（専攻医）")).toBe("医師");
    expect(attendingDesk("井上（循環器内科）")).toBe("医師:井上（循環器内科）");
  });
});
describe("食事指示量の既定", () => {
  it.each([["TD-ENERGY", 1600, 70], ["TD-SALT-HEART", 1600, 65], ["TD-KIDNEY", 1800, 50], ["TD-LIVER", 1600, 50]])("%s", (therapeutic, energyKcal, proteinG) => {
    expect(dietNutrients({ ...current, kind: "治療食", therapeutic })).toEqual({ energyKcal, proteinG });
  });
  it("個別指示を優先し、未指示と絶食を区別する", () => {
    expect(dietNutrients(current)).toEqual({ energyKcal: 1800, proteinG: 70 });
    expect(dietNutrients({ ...current, kind: "嚥下調整食" })).toEqual({ energyKcal: 1400, proteinG: 55 });
    expect(dietNutrients({ ...current, energyKcal: 1500, proteinG: 60 })).toEqual({ energyKcal: 1500, proteinG: 60 });
    expect(dietNutrients({ ...current, kind: "絶食" })).toEqual({ energyKcal: 0, proteinG: 0 });
    expect(dietNutrients()).toEqual({});
  });
});
