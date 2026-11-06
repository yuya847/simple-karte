import { describe, expect, it } from "vitest";
import { totalPrescriptionPart } from "./total-prescription";
import { iyakuItem, tokkiItem, topicalDispensingItem } from "./master-items";
import { drugPoints, materialPoints } from "./drug";
import { EAR_DROP, PEN_NEEDLE_CODE } from "../prescription-kind";
import { calculateClaim } from "./engine";
import { DEFAULT_OPTIONS } from "./model";
import { defaultSliding } from "../insulin";
import { insulinDoses } from "../insulin-doses";
import { DRUGS } from "../master";
import type { OrderEntry } from "../types";
describe("外用・針・時刻別インスリンの算定", () => {
  it("湿布14枚を1調剤で算定し日数を掛けない", () => {
    const p = totalPrescriptionPart("620003477", 14, "枚", { kind: "外用", usage: "1日1回 腰に貼付" })!;
    expect(p.lines[0]).toMatchObject({ record: "IY", code: "620003477", quantity: 14 });
    expect(p.points).toBe(drugPoints(iyakuItem("620003477")!.price * 14));
  });
  it("ペン針のコード・価格・単位を特定器材マスターから読む", () => {
    const m = tokkiItem(PEN_NEEDLE_CODE)!;
    expect(m.name).toContain("注射針");
    const p = totalPrescriptionPart(PEN_NEEDLE_CODE, 30, "本", { kind: "材料", usage: "自己注射用" })!;
    expect(p.lines[0]).toMatchObject({ record: "TO", code: PEN_NEEDLE_CODE, quantity: 30 });
    expect(p.points).toBe(materialPoints(m.price * 30));
    expect(totalPrescriptionPart(PEN_NEEDLE_CODE, 0.5, "本", { kind: "材料", usage: "自己注射用" })).toBeNull();
  });
  it("点耳薬のコード・名称・単位を既存の医薬品マスターと照合する", () => {
    expect(iyakuItem(EAR_DROP.code)).toMatchObject({ name: EAR_DROP.name, unit: EAR_DROP.unit });
    expect(totalPrescriptionPart(EAR_DROP.code, 5, "mL", { kind: "外用", usage: "1日2回 右耳に点耳" })?.lines[0]).toMatchObject({ code: EAR_DROP.code, quantity: 5 });
  });
  it("外用薬の調剤料を現行の医科マスターから取得する", () => {
    expect(topicalDispensingItem()).toMatchObject({ kubun: "F000", points: 8 });
  });
  it("注射の朝昼夕の異なる量と未実施・スケール実施量を反映する", () => {
    const d = DRUGS.find(d => d.category === "インスリン" && d.insulinUnitsPerBillingUnit === 300)!;
    const e: OrderEntry = { kind: "order", id: "ins", day: 0, time: "00:00", author: "医師", status: "有効", order: { type: "injection", items: [{ drugCode: d.code, amount: 1, unit: "単位" }], insulinDoses: insulinDoses([2, 3, 4, 0]), route: "皮下注", schedule: { kind: "per_day", count: 3 }, start: { day: 0, time: "00:00" }, days: 1 } };
    const run = (notGiven: string[] = [], insulinGiven: { key: string; units: number }[] = []) => calculateClaim({ today: "2026-11-06", nowTime: "23:59", month: "2026-11", patient: { id: "test", name: "試験", sex: "男", age: 50, admittedOn: 0 }, entries: [e], daily: [], cultures: [], diagnoses: [], options: DEFAULT_OPTIONS, notGiven, insulinGiven });
    const quantity = (r: ReturnType<typeof run>) => r.acts.flatMap(a => a.parts.flatMap(p => p.lines)).find(l => l.code === d.code)?.quantity;
    expect(quantity(run())).toBeCloseTo(9 / 300);
    expect(quantity(run(["ins|690"]))).toBeCloseTo(6 / 300);
    expect(quantity(run([], [{ key: "ins|690", units: 5 }]))).toBeCloseTo(11 / 300);
    if (e.order.type === "injection") { e.order.insulinDoses = insulinDoses([0, 0, 0, 0]); e.order.sliding = defaultSliding(); }
    expect(quantity(run([], [450, 690, 1050, 1260].map(at => ({ key: `ins|${at}`, units: 0 }))))).toBeUndefined();
  });
});
