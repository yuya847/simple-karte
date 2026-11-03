import { describe, expect, it } from "vitest";
import { DRUG_INFO } from "./drug-info";
import { amountText, bagsOf, bagLine } from "./discharge-rx";
import { ORAL_DRUGS } from "./master";
import type { OrderEntry, PrescriptionOrder } from "./types";

const rx = (id: string, o: Partial<PrescriptionOrder>, rp = "rp1"): OrderEntry => ({
  kind: "order",
  id,
  day: 0,
  time: "10:00",
  author: "山本（専攻医）",
  status: "有効",
  order: { type: "prescription", category: "退院時", drugCode: "ORAL-ENA5", amount: 1, unit: "錠", timings: ["朝"], start: { day: 1, timing: "朝" }, days: 14, rp, ...o },
});

describe("退院時処方の薬袋", () => {
  it("has plain words for every oral drug of the master", () => {
    for (const d of ORAL_DRUGS) {
      expect(DRUG_INFO[d.code]?.what, d.code).toBeTruthy();
      expect(DRUG_INFO[d.code].care.length, d.code).toBeGreaterThan(0);
    }
  });
  it("makes one bag per Rp and counts the total (1回量 × 回数 × 日数)", () => {
    const bags = bagsOf([
      rx("a", { drugCode: "ORAL-ENA5" }),
      rx("b", { drugCode: "ORAL-BISO25" }),
      rx("c", { drugCode: "ORAL-MGO330", timings: ["朝", "夕"] }, "rp2"),
      rx("d", { category: "定期" }, "rp3"),
    ]);
    expect(bags).toHaveLength(2);
    expect(bags[0].drugs.map((d) => d.total)).toEqual([14, 14]);
    expect(bags[1].drugs[0].total).toBe(28);
    expect(bags[1].how).toBe("1日2回　朝夕食後");
    expect(amountText(bags[1])).toBe("14日分");
    expect(bagLine(bags[1])).toContain("酸化マグネシウム錠330mg 1回1錠");
  });
  it("leaves out stopped orders", () => {
    expect(bagsOf([{ ...rx("a", {}), status: "中止", stoppedOn: 0 }])).toHaveLength(0);
  });
  it("makes a 頓服 bag with the condition", () => {
    const [b] = bagsOf([rx("p", { drugCode: "ORAL-APAP500", timings: [], prn: "発熱時（38.5℃以上）", maxPerDay: 3, days: 10 })]);
    expect(b.kind).toBe("頓服");
    expect(b.how).toBe("発熱時（38.5℃以上）（1日3回まで）");
    expect(b.drugs[0].total).toBe(10);
    expect(amountText(b)).toBe("10回分");
  });
});

describe("退院時処方は病棟では配らない", () => {
  it("is not on the ward worksheet nor in the oral calendar marks", async () => {
    const { buildWorksheet } = await import("./worksheet");
    const { prescriptionCell } = await import("./calendar");
    const e = rx("h", { drugCode: "ORAL-ENA5", start: { day: 0, timing: "朝" } });
    const p = { patient: { id: "x" } as never, room: "501A", entries: [e] };
    const sheet = buildWorksheet([p], 0, 2 * 1440, 6 * 60);
    expect([...sheet.timed, ...sheet.untimed].filter((i) => i.orderId === "h")).toHaveLength(0);
    expect(prescriptionCell(e, 1, 6 * 60).slots.every((s) => s.state === null)).toBe(true);
  });
});

describe("退院時処方の重複", () => {
  it("does not call the same drug taken on the ward a duplicate, but does between 退院時処方", async () => {
    const { checkPrescription } = await import("./rx");
    const ward = { ...rx("w", { category: "持参薬" }), id: "w" };
    const home = rx("h2", {});
    const ctx = { activeOrders: [ward], labOrders: [], drafts: [], nowTime: "10:00", fmtDay: () => "", describe: () => "エナラプリル" };
    const draft = { id: "d", origin: "manual" as const, sourceText: "", comment: null, kind: "prescription" as const, category: "退院時" as const, items: [{ drugCode: "ORAL-ENA5", said: "エナラプリル", daily: null, perDose: 1 }], timings: ["朝" as const], prn: null, maxPerDay: null, days: 14, start: { day: null, timing: null }, acks: [] };
    expect(checkPrescription(draft, ctx).some((i) => i.title === "重複")).toBe(false);
    expect(checkPrescription(draft, { ...ctx, activeOrders: [ward, home] }).some((i) => i.title === "重複")).toBe(true);
    expect(checkPrescription({ ...draft, category: "定期" }, ctx).some((i) => i.title === "重複")).toBe(true);
  });
});
