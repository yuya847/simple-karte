import { initialLines } from "./standing-lines";
import { standingFromBlocks } from "./standing-blocks";
import { describe, expect, it } from "vitest";
import { ackLine, condHits, condMissing, condText, emptyCond, hitKey, latestOf, openHits, ruleText, type CondRule } from "./cond-orders";
import { PATIENTS } from "./patients";
import type { Patient } from "./types";

const k4: CondRule = { id: "c1", source: "lab", item: "K", op: "<", value: 4, action: "補うかは医師が決める", callDoctor: true };
const sbp: CondRule = { id: "c2", source: "vital", item: "sbp", op: "<", value: 90, action: "", callDoctor: true };
const rec: Pick<Patient, "labs" | "vitals"> = {
  labs: [
    { day: -2, time: "06:00", values: { K: 3.2 } },
    { day: 0, time: "06:00", values: { K: 3.6, Na: 137 } },
    { day: 0, time: "08:00", values: { Na: 136 } },
  ],
  vitals: [
    { day: 0, time: "06:00", sbp: 84 },
    { day: 0, time: "10:00", sbp: 102, hr: 80 },
    { day: 0, time: "12:00", hr: 88 },
  ],
};

describe("条件付き指示", () => {
  it("writes the condition and what to do in words", () => {
    expect(condText(k4)).toBe("K 4 mmol/L 未満");
    expect(ruleText(k4)).toBe("K 4 mmol/L 未満なら：医師へ連絡。補うかは医師が決める");
    expect(ruleText({ ...sbp, op: "≤" })).toBe("収縮期血圧 90 mmHg 以下なら：医師へ連絡");
  });

  it("asks for the item, the value and what to do before it can be confirmed", () => {
    expect(condMissing(emptyCond("x"))).toEqual(["項目", "値", "当たったときにすること"]);
    expect(condMissing({ ...k4, item: "XYZ" })).toEqual(["項目（マスターにない）"]);
    expect(condMissing(k4)).toEqual([]);
    expect(condMissing({ ...k4, callDoctor: false, action: " " })).toEqual(["当たったときにすること"]);
  });

  it("compares the latest measurement of the item, not an older one", () => {
    expect(latestOf(k4, rec)).toEqual({ value: 3.6, at: { day: 0, time: "06:00" } });
    // The latest blood pressure is 102 at 10:00 (the 12:00 vitals have no blood pressure).
    expect(latestOf(sbp, rec)).toEqual({ value: 102, at: { day: 0, time: "10:00" } });
    const hits = condHits("p1", [k4, sbp], rec);
    expect(hits.map((h) => h.text)).toEqual(["K 3.6 mmol/L（基準 4 mmol/L 未満）"]);
    expect(hits[0].key).toBe(hitKey("p1", "c1", { day: 0, time: "06:00" }));
  });

  it("checks the boundary as the doctor wrote it", () => {
    const at = { labs: [{ day: 0, time: "06:00", values: { K: 4 } }], vitals: [] };
    expect(condHits("p", [k4], at)).toEqual([]);
    expect(condHits("p", [{ ...k4, op: "≤" }], at)).toHaveLength(1);
    expect(condHits("p", [{ ...k4, op: ">" }], at)).toEqual([]);
    expect(condHits("p", [{ ...k4, op: "≥" }], at)).toHaveLength(1);
  });

  it("does not use an incomplete rule", () => {
    expect(condHits("p", [{ ...k4, value: Number.NaN }], rec)).toEqual([]);
  });

  it("drops a hit once a nurse records it, until a newer value meets it again", () => {
    const hits = condHits("p1", [k4], rec);
    const acks = { [hits[0].key]: { key: hits[0].key, by: "看護師 佐藤", at: { day: 0, time: "09:00" }, note: "医師に連絡した" } };
    expect(openHits(hits, acks)).toEqual([]);
    const later = { ...rec, labs: [...rec.labs, { day: 0, time: "14:00", values: { K: 3.4 } }] };
    expect(openHits(condHits("p1", [k4], later), acks)).toHaveLength(1);
    expect(ackLine(hits[0], "医師に連絡し、指示を受けた", "09:00")).toBe("・条件付き指示（K 4 mmol/L 未満なら：医師へ連絡。補うかは医師が決める）に当たる：K 3.6 mmol/L（基準 4 mmol/L 未満）（06:00 の値）。09:00 対応：医師に連絡し、指示を受けた");
  });

  it("finds the fictional rules of 北村さん against his record", () => {
    const kita = PATIENTS.find((p) => p.id === "90010198")!;
    const s = standingFromBlocks(initialLines()["90010198"])!;
    const hits = condHits(kita.id, s.conds, kita);
    expect(hits.map((h) => h.rule.id)).toContain("call-90010198:block-cond-0");
    expect(hits.find((h) => h.rule.id === "call-90010198:block-cond-0")!.value).toBe(3.6);
  });
});
