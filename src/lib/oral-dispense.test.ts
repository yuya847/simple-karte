import { describe, expect, it } from "vitest";
import { PATIENTS } from "./patients";
import { oralKey, oralToDispense, packetsOf, qtyFormula, qtyText, recordStep, sameHands, slotRange, stepBlock, type OralRp } from "./oral-dispense";
import { dispenseBlock, type Query } from "./pharmacy";
import type { OrderEntry, PrescriptionOrder } from "./types";

const people = PATIENTS.map((p, i) => ({ patient: p, room: ["512", "515B", "508A", "511"][i], entries: p.history.filter((e): e is OrderEntry => e.kind === "order") }));
const NOW = 10 * 60; // today 10:00

const rx = (id: string, day: number, time: string, o: Omit<PrescriptionOrder, "type" | "unit"> & { unit?: string }, extra: Partial<OrderEntry> = {}): OrderEntry => ({
  kind: "order",
  id,
  day,
  time,
  author: "山本（専攻医）",
  status: "有効",
  ...extra,
  order: { type: "prescription", unit: "錠", ...o },
});
const withRx = (i: number, ...es: OrderEntry[]) => people.map((x, j) => (j === i ? { ...x, entries: [...x.entries, ...es] } : x));

describe("内服の調剤：定期（明日から N 日分）", () => {
  it("counts 1回量 × the doses from the order: 北村さんの酸化マグネシウムは明日の朝から4日目の朝まで（7日分の処方の残り）", () => {
    const list = oralToDispense(people, { kind: "定期", days: 7 }, NOW);
    const kita = list.find((x) => x.patient.id === "90010198")!;
    expect(kita.rps).toHaveLength(1);
    const rp = kita.rps[0];
    expect(rp.lines[0].slots.map((s) => `${s.day}${s.timing}`)).toEqual(["1朝", "1夕", "2朝", "2夕", "3朝", "3夕", "4朝"]);
    expect(rp.lines[0].total).toBe(7);
    // The last day is not whole, so the formula counts the doses.
    expect(qtyFormula(rp.lines[0], 2)).toBe("1回1錠 × 7回 = 7錠");
    expect([rp.from, rp.to]).toEqual([1, 4]);
    expect(slotRange(rp)).toEqual({ first: { day: 1, timing: "朝" }, last: { day: 4, timing: "朝" } });
  });
  it("whole days read as 1回量 × 回数 × 日数", () => {
    const rp = oralToDispense(people, { kind: "定期", days: 2 }, NOW).find((x) => x.patient.id === "90010198")!.rps[0];
    expect(qtyFormula(rp.lines[0], 2)).toBe("1回1錠 × 1日2回 × 2日 = 4錠");
  });
  it("leaves out 持参薬 and 退院時, and lists 頓用 apart without a count", () => {
    const list = oralToDispense(people, { kind: "定期", days: 7 }, NOW);
    const ids = list.flatMap((x) => x.rps.flatMap((r) => r.orderIds));
    expect(ids.some((id) => id.startsWith("kita-home") || id === "kita-ena" || id === "sakura-amlo")).toBe(false);
    const sakura = list.find((x) => x.patient.id === "90010231")!;
    expect(sakura.rps).toHaveLength(0);
    expect(sakura.prn[0].text).toContain("頓用 発熱時");
  });
  it("leaves out stopped orders and puts the drugs of one Rp together", () => {
    const a = rx("t-a", -2, "10:00", { category: "定期", drugCode: "ORAL-FRS20", amount: 1, timings: ["朝"], start: { day: -1, timing: "朝" }, days: 14, rp: "rp-t" });
    const b = rx("t-b", -2, "10:00", { category: "定期", drugCode: "ORAL-SPL25", amount: 2, timings: ["朝"], start: { day: -1, timing: "朝" }, days: 14, rp: "rp-t" });
    const stopped = rx("t-c", -2, "10:00", { category: "定期", drugCode: "ORAL-REBA100", amount: 1, timings: ["朝", "昼", "夕"], start: { day: -1, timing: "朝" }, days: 14 }, { status: "中止", stoppedOn: 0 });
    const rps = oralToDispense(withRx(0, a, b, stopped), { kind: "定期", days: 7 }, NOW).find((x) => x.patient.id === "90010231")!.rps;
    expect(rps).toHaveLength(1);
    expect(rps[0].lines.map((l) => [l.code, l.total])).toEqual([
      ["ORAL-FRS20", 7],
      ["ORAL-SPL25", 14],
    ]);
    expect(qtyFormula(rps[0].lines[1], 1)).toBe("1回2錠 × 1日1回 × 7日 = 14錠");
  });
});

describe("内服の調剤：臨時（今日の新規）", () => {
  it("counts the whole course of a 臨時 written today", () => {
    const e = rx("r-1", 0, "09:00", { category: "臨時", drugCode: "ORAL-LOX60", amount: 1, timings: ["朝", "夕"], start: { day: 0, timing: "夕" }, days: 3 });
    const rp = oralToDispense(withRx(3, e), { kind: "臨時" }, NOW).find((x) => x.patient.id === "90010260")!.rps[0];
    expect(rp.lines[0].slots.map((s) => `${s.day}${s.timing}`)).toEqual(["0夕", "1朝", "1夕", "2朝", "2夕", "3朝"]);
    expect(rp.lines[0].total).toBe(6);
    expect(rp.category).toBe("臨時");
  });
  it("a 定期 written today gives only today's doses (初回); from tomorrow it is in the 定期 batch", () => {
    const e = rx("t-new", 0, "09:00", { category: "定期", drugCode: "ORAL-MET250", amount: 1, timings: ["朝", "昼", "夕"], start: { day: 0, timing: "昼" }, days: 14 });
    const today = oralToDispense(withRx(3, e), { kind: "臨時" }, NOW).find((x) => x.patient.id === "90010260")!.rps[0];
    expect(today.first).toBe(true);
    expect(today.lines[0].total).toBe(2);
    const batch = oralToDispense(withRx(3, e), { kind: "定期", days: 7 }, NOW).find((x) => x.patient.id === "90010260")!.rps[0];
    expect(batch.lines[0].total).toBe(21);
    expect(oralKey(today)).not.toBe(oralKey(batch));
  });
  it("leaves out orders written before today", () => {
    expect(oralToDispense(people, { kind: "臨時" }, NOW).flatMap((x) => x.rps)).toHaveLength(0);
  });
  it("a 臨時 without 日数 cannot be counted, and says so", () => {
    const e = rx("r-nodays", 0, "09:00", { category: "臨時", drugCode: "ORAL-SENNA12", amount: 2, timings: ["眠前"], start: { day: 0, timing: "眠前" } });
    const rp = oralToDispense(withRx(3, e), { kind: "臨時" }, NOW).find((x) => x.patient.id === "90010260")!.rps[0];
    expect(rp.unbounded).toBe(true);
    expect(stepBlock("prepared", undefined, rp, null)).toContain("日数の指定がない");
  });
});

describe("配薬ラベル（一包化）", () => {
  it("one packet per day and timing, with every drug taken then", () => {
    const a = rx("p-a", -2, "10:00", { category: "定期", drugCode: "ORAL-FRS20", amount: 1, timings: ["朝"], start: { day: -1, timing: "朝" }, days: 14 });
    const b = rx("p-b", -2, "10:00", { category: "定期", drugCode: "ORAL-REBA100", amount: 1, timings: ["朝", "昼", "夕"], start: { day: -1, timing: "朝" }, days: 14 });
    const rps = oralToDispense(withRx(0, a, b), { kind: "定期", days: 2 }, NOW).find((x) => x.patient.id === "90010231")!.rps;
    const packs = packetsOf(rps);
    expect(packs.map((p) => `${p.day}${p.timing}`)).toEqual(["1朝", "1昼", "1夕", "2朝", "2昼", "2夕"]);
    expect(packs[0].drugs.map((d) => d.name)).toEqual(["フロセミド錠", "レバミピド錠"]);
    expect(packs[0].time).toBe("08:00");
    expect(packs[1].drugs).toHaveLength(1);
  });
});

describe("調剤 → 鑑査 → 払出", () => {
  const rp = oralToDispense(people, { kind: "定期", days: 7 }, NOW).find((x) => x.patient.id === "90010198")!.rps[0];
  const me = { by: "薬剤師 小林", at: "11/4 10:00" };
  const other = { by: "薬剤師 吉田", at: "11/4 10:10" };
  it("goes in order", () => {
    expect(stepBlock("checked", undefined, rp, null)).toContain("先に調剤");
    const r1 = recordStep(undefined, "prepared", rp, me);
    expect(r1.qty).toBe(qtyText(rp));
    expect(stepBlock("prepared", r1, rp, null)).toBe("調剤済みです。");
    expect(stepBlock("issued", r1, rp, null)).toContain("先に鑑査");
    const r2 = recordStep(r1, "checked", rp, other);
    expect(sameHands(r2)).toBe(false);
    expect(stepBlock("issued", r2, rp, null)).toBeNull();
    const r3 = recordStep(r2, "issued", rp, me);
    expect(stepBlock("issued", r3, rp, null)).toBe("払出済みです。");
  });
  it("notes when the same pharmacist checked what they prepared", () => {
    expect(sameHands(recordStep(recordStep(undefined, "prepared", rp, me), "checked", rp, me))).toBe(true);
  });
  it("a change of the prescription after 調剤 needs a new 調剤", () => {
    const r1 = recordStep(undefined, "prepared", rp, me);
    const changed: OralRp = { ...rp, lines: rp.lines.map((l) => ({ ...l, total: l.total + 1 })) };
    expect(stepBlock("checked", r1, changed, null)).toContain("調剤し直して");
    expect(stepBlock("prepared", r1, changed, null)).toBeNull();
    expect(recordStep({ ...r1, checked: other }, "prepared", changed, me)).toEqual({ prepared: me, qty: qtyText(changed) });
  });
  it("is stopped by an open 疑義照会 or an order not yet audited (as 注射の払出)", () => {
    expect(stepBlock("prepared", undefined, rp, "疑義照会の回答待ちです")).toBe("疑義照会の回答待ちです");
  });
});

describe("払い出せないオーダ（注射と内服で共通）", () => {
  const e = rx("q-1", 0, "09:00", { category: "臨時", drugCode: "ORAL-LOX60", amount: 1, timings: ["朝"], start: { day: 1, timing: "朝" }, days: 3 });
  const ppl = withRx(3, e);
  const q: Query = { id: "q", patientId: "90010260", orderId: "q-1", question: "腎機能から量の確認を", askedAt: "09:30", by: "薬剤師 小林", status: "回答待ち" };
  it("an order written since yesterday waits for 処方監査", () => {
    expect(dispenseBlock("q-1", ppl, [], {})).toContain("まだ監査していません");
    expect(dispenseBlock("q-1", ppl, [], { "q-1": "09:40" })).toBeNull();
  });
  it("an open 疑義照会 stops it even when audited; older orders need no audit here", () => {
    expect(dispenseBlock("q-1", ppl, [q], { "q-1": "09:40" })).toContain("疑義照会の回答待ち");
    expect(dispenseBlock("kita-mgo", ppl, [], {})).toBeNull();
  });
});

describe("払出の記録更新でも操作順を守る", () => {
  const rp = oralToDispense(people, { kind: "定期", days: 7 }, NOW).find((x) => x.patient.id === "90010198")!.rps[0];
  const who = { by: "薬剤師", at: "11/6 10:00" };
  it("調剤・鑑査を飛ばした払出を記録しない", () => {
    expect(recordStep(undefined, "issued", rp, who)).toEqual({});
    expect(recordStep(undefined, "checked", rp, who)).toEqual({});
    const prepared = recordStep(undefined, "prepared", rp, who);
    expect(recordStep(prepared, "issued", rp, who)).toEqual(prepared);
    const checked = recordStep(prepared, "checked", rp, who);
    const issued = recordStep(checked, "issued", rp, who);
    expect(issued.issued).toEqual(who);
    expect(recordStep(issued, "issued", rp, { ...who, at: "11:00" })).toEqual(issued);
  });
  it("麻薬は一般内服でどの段階も更新しない", () => {
    const narcotic = { ...rp, lines: rp.lines.map((l) => ({ ...l, code: "ORAL-OXC5" })) };
    for (const step of ["prepared", "checked", "issued"] as const) {
      expect(stepBlock(step, undefined, narcotic, null)).toBe("麻薬の画面で払出");
      expect(recordStep(undefined, step, narcotic, who)).toEqual({});
    }
  });
});
