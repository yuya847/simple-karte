import { describe, expect, it } from "vitest";
import { checkDraft, isReady, toOrder, type CheckContext, type Draft } from "./drafts";
import { PATIENTS } from "./patients";
import { firstDose, perDoseOf, type PrescriptionDraft } from "./rx";
import type { OrderEntry } from "./types";

const kitamura = PATIENTS.find((p) => p.id === "90010198")!;
const orders = kitamura.history.filter((e): e is OrderEntry => e.kind === "order");
const ctx = (extra: Partial<CheckContext> = {}): CheckContext => ({
  activeOrders: orders.filter((o) => o.status === "有効"),
  labOrders: [],
  drafts: [],
  nowTime: "10:00",
  fmtDay: (d) => `D${d}`,
  describe: (o) => o.id,
  allergies: kitamura.allergies,
  ...extra,
});
const rx = (o: Partial<PrescriptionDraft>): PrescriptionDraft => ({
  id: "rx1",
  origin: "manual",
  sourceText: "",
  comment: null,
  kind: "prescription",
  category: "定期",
  items: [{ drugCode: "ORAL-REBA100", said: "レバミピド", daily: 3, perDose: null }],
  timings: ["朝", "昼", "夕"],
  prn: null,
  maxPerDay: null,
  days: 7,
  start: { day: null, timing: null },
  acks: [],
  ...o,
});
const key = (d: Draft, k: string) => checkDraft(d, ctx()).find((i) => i.key.startsWith(k));

describe("処方（Rp）", () => {
  it("1日量 ÷ 回数 = 1回量 (shown as a formula)", () => {
    expect(perDoseOf({ drugCode: null, said: "", daily: 3, perDose: null }, 3)).toBe(1);
    expect(key(rx({}), "per")?.formula).toBe("1日3錠 ÷ 3回 = 1回1錠");
    expect(isReady(checkDraft(rx({}), ctx()))).toBe(true);
  });
  it("an amount that does not divide is an error (1日2錠 分3)", () => {
    expect(key(rx({ items: [{ drugCode: "ORAL-REBA100", said: "", daily: 2, perDose: null }] }), "split")?.level).toBe("stop");
  });
  it("a scored tablet may be halved (アセトアミノフェン 1日1錠 分2 → 1回0.5錠)", () => {
    expect(key(rx({ items: [{ drugCode: "ORAL-APAP500", said: "", daily: 1, perDose: null }], timings: ["朝", "夕"] }), "split")).toBeUndefined();
  });
  it("allergy class (NSAIDs) is a warning the doctor may confirm with アレルギー承知", () => {
    const d = rx({ items: [{ drugCode: "ORAL-LOX60", said: "ロキソニン", daily: 3, perDose: null }] });
    const w = key(d, "allergy")!;
    expect(w.level).toBe("ask");
    const acked = w.choices![0].apply!(d);
    expect(isReady(checkDraft(acked, ctx()))).toBe(true);
    const o = (toOrder(acked, ctx()).orders ?? [])[0];
    expect(o.type === "prescription" && o.acks).toEqual(["アレルギー承知"]);
  });
  it("極量: ロキソプロフェン 1日4錠 = 240mg > 180mg", () => {
    const d = rx({ items: [{ drugCode: "ORAL-LOX60", said: "", daily: 4, perDose: null }], timings: ["朝", "昼", "夕", "眠前"], acks: ["アレルギー承知"] });
    expect(key(d, "max")?.message).toContain("240mg");
  });
  it("重複: the same ingredient already running (北村 スピロノラクトン)", () => {
    const d = rx({ items: [{ drugCode: "ORAL-SPL25", said: "", daily: 1, perDose: null }], timings: ["朝"] });
    expect(key(d, "dup")?.level).toBe("ask");
  });
  it("one Rp of two drugs makes two orders sharing the Rp, starting at the next dose time", () => {
    const d = rx({ items: [{ drugCode: "ORAL-REBA100", said: "", daily: 3, perDose: null }, { drugCode: "ORAL-MGO330", said: "", daily: 3, perDose: null }] });
    const os = toOrder(d, ctx()).orders!;
    expect(os).toHaveLength(2);
    expect(os.every((o) => o.type === "prescription" && o.rp === "rx1" && o.amount === 1 && o.dailyAmount === 3)).toBe(true);
    expect(firstDose(["朝", "昼", "夕"], "10:00")).toEqual({ day: 0, timing: "昼" });
  });
  it("頓用: 1回量, condition and 1日N回まで; missing items are asked", () => {
    const d = rx({ category: null, items: [{ drugCode: "ORAL-APAP500", said: "", daily: null, perDose: 1 }], timings: [], prn: "発熱時", maxPerDay: 3, days: null });
    expect(isReady(checkDraft(d, ctx()))).toBe(true);
    expect(toOrder(d, ctx()).orders![0]).toMatchObject({ category: "臨時", prn: "発熱時", maxPerDay: 3, timings: [] });
    expect(key(rx({ timings: null, days: null }), "usage")?.choices?.map((c) => c.label)).toContain("分3 毎食後");
  });
});

describe("罫線入力から確定した調剤の文", () => {
  it("コメントと一包化を下書きの文・全薬のオーダへ渡す", async () => {
    const { rpLine } = await import("./rp");
    const { orderLines } = await import("./format");
    const d = rx({ onePack: true, comment: "服用時に確認", items: [
      { drugCode: "ORAL-REBA100", said: "レバミピド", daily: null, perDose: 1 },
      { drugCode: "ORAL-MGO330", said: "酸化マグネシウム", daily: null, perDose: 1 },
    ] });
    expect(rpLine(d)).toContain("服用時に確認　一包化");
    const confirmed = toOrder(d, ctx()).orders!;
    expect(confirmed).toHaveLength(2);
    for (const order of confirmed) {
      expect(order.type === "prescription" && order.onePack).toBe(true);
      expect(orderLines(order, { y: 2026, m: 11, d: 4 }).detail).toContain("服用時に確認　一包化");
    }
  });
});
