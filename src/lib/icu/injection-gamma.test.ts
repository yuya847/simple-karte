import { describe, expect, it } from "vitest";
import { DRUGS } from "../master";
import { injectionGamma } from "./injection-gamma";

const code = (name: string) => DRUGS.find((d) => d.name.normalize("NFKC").includes(name))!.code;
describe("注射の持続（mL/時）の γ（表示だけ）", () => {
  it("ノルアドレナリン 0.1% 5A ＋ 生食 45mL を 3mL/時、50kg：5mg/50mL", () => {
    const g = injectionGamma([{ drugCode: code("ノルアドレナリン注射液"), amount: 5, unit: "A" }, { drugCode: code("大塚生食注 50mL"), amount: 45, unit: "mL" }], 3, 50)!;
    expect(g.gamma).toBeCloseTo(0.1);
    expect(g.text).toBe("3mL/時 × 5mg/50mL × 1000 ÷（50kg × 60）= 0.10μg/kg/分");
  });
  it("規格の強さと容量（ドパミン 100mg/5mL）。アンプルの容量がマスターにないときは出さない", () => {
    expect(injectionGamma([{ drugCode: code("ドパミン塩酸塩点滴静注100mg"), amount: 1, unit: "A" }, { drugCode: code("大塚生食注 50mL"), amount: 45, unit: "mL" }], 3, 50)?.gamma).toBeCloseTo(2);
    expect(injectionGamma([{ drugCode: code("ドパミン塩酸塩点滴静注100mg"), amount: 100, unit: "mg" }, { drugCode: code("大塚生食注 50mL"), amount: 45, unit: "mL" }], 3, 50)?.gamma).toBeCloseTo(2);
    expect(injectionGamma([{ drugCode: code("ドブタミン点滴静注100mg"), amount: 1, unit: "A" }, { drugCode: code("大塚生食注 50mL"), amount: 50, unit: "mL" }], 3, 50)).toBeNull();
  });
  it("体重・速さ・量がないとき、主の薬が輸液のときは出さない", () => {
    const nor = { drugCode: code("ノルアドレナリン注射液"), amount: 5, unit: "A" }, saline = { drugCode: code("大塚生食注 50mL"), amount: 45, unit: "mL" };
    expect(injectionGamma([nor, saline], 3, undefined)).toBeNull();
    expect(injectionGamma([nor, saline], 0, 50)).toBeNull();
    expect(injectionGamma([{ ...nor, amount: null }, saline], 3, 50)).toBeNull();
    expect(injectionGamma([saline, nor], 3, 50)).toBeNull();
  });
});
