import { describe, expect, it } from "vitest";
import { ANAMNESIS_SECTIONS, emptyAnamnesis } from "../anamnesis";
import { cleanIntake, INTAKE_ITEMS, intakeRows, intakeToFields } from "./intake";

const form = ANAMNESIS_SECTIONS.flatMap((s) => s.fields);

describe("入院時の情報（患者さんの入力）", () => {
  it("項目と選択肢は情報収集の様式のもの（アレルギーは患者プロファイル）", () => {
    for (const item of INTAKE_ITEMS) {
      if (item.key === "allergy") continue;
      const f = form.find((x) => x.key === item.key);
      expect(f, item.key).toBeDefined();
      expect(item.staff).toBe(f!.label);
      if (f!.type === "one" || f!.type === "many") for (const o of item.options ?? []) expect(f!.options).toContain(o.value);
    }
    expect(INTAKE_ITEMS.map((i) => i.key)).toEqual(expect.arrayContaining(["pastHistory", "meds", "allergy", "living", "keyPerson", "keyContact", "hope"]));
    // 医療者が判断する項目（自立度・介助・認知・せん妄）は患者さんに聞かない
    expect(INTAKE_ITEMS.map((i) => i.key)).not.toEqual(expect.arrayContaining(["adlRank"]));
    expect(INTAKE_ITEMS.some((i) => ["cognition", "deliriumHistory", "adlRank"].includes(i.key))).toBe(false);
  });

  it("届いた答えは項目と値を確かめて残す", () => {
    const a = cleanIntake({ pastHistory: "  高血圧  ", living: "独居", alcohol: "多飲", aids: ["杖", "杖", "空飛ぶ椅子"], unknown: "x", meds: 3, home: "あ".repeat(500) });
    expect(a).toEqual({ pastHistory: "高血圧", living: "独居", aids: ["杖"], home: "あ".repeat(100) });
    expect(cleanIntake(null)).toBeNull();
    expect(cleanIntake(["x"])).toBeNull();
  });

  it("確定すると答えたところだけが情報収集に入り、アレルギーは入らない", () => {
    const base = { ...emptyAnamnesis(), occupation: "元・和裁", living: "家族と同居" };
    const f = intakeToFields(base, { living: "独居", aids: ["義歯"], allergy: "卵", hope: "家に帰りたい" });
    expect(f).toMatchObject({ occupation: "元・和裁", living: "独居", aids: ["義歯"], hope: "家に帰りたい" });
    expect(JSON.stringify(f)).not.toContain("卵");
    expect(base.living).toBe("家族と同居");
  });

  it("看護師には様式の言葉で、いまの記録と並べる", () => {
    const rows = intakeRows({ living: "独居", allergy: "卵（じんましん）" }, { ...emptyAnamnesis(), living: "家族と同居" });
    expect(rows.map((r) => [r.item.staff, r.answer, r.now])).toEqual([
      ["アレルギー（患者プロファイル）", "卵（じんましん）", ""],
      ["住まい", "独居", "家族と同居"],
    ]);
  });
});
