import { describe, expect, it } from "vitest";
import { adrop, chadsVasc, childPugh, curb65, gcs, hasBled, nihss, NIHSS_ITEMS, qsofa } from "./scores";

describe("GCS", () => {
  it("E・V・M の合計。NT・未選択は合計なし", () => {
    expect(gcs("4", "5", "6")).toEqual({ total: 15, text: "E4V5M6" });
    expect(gcs("3", "NT", "5")).toEqual({ total: null, text: "E3VNTM5" });
    expect(gcs("3", null, "5").total).toBeNull();
  });
});

describe("NIHSS（15項目）", () => {
  it("15項目で、最大 42 点", () => {
    expect(NIHSS_ITEMS.map((i) => i.key)).toEqual(["1a", "1b", "1c", "2", "3", "4", "5a", "5b", "6a", "6b", "7", "8", "9", "10", "11"]);
    const max = Object.fromEntries(NIHSS_ITEMS.map((i) => [i.key, i.options.filter((o) => o.value !== "UN").at(-1)!.value]));
    expect(nihss(max).total).toBe(42);
  });
  it("UN は点に数えない。未選択があれば合計を出さず、選んだ分と未選択を返す", () => {
    const zero = Object.fromEntries(NIHSS_ITEMS.map((i) => [i.key, "0"]));
    expect(nihss({ ...zero, "5a": "UN", "4": "2" }).total).toBe(2);
    const partial = nihss({ "1a": "1", "9": "2" });
    expect(partial.total).toBeNull();
    expect(partial.sum).toBe(3);
    expect(partial.missing).toHaveLength(13);
  });
});

describe("qSOFA の境界", () => {
  it("呼吸数 22 以上・収縮期 100 以下・意識変容で各1点", () => {
    expect(qsofa({ rr: 22, altered: false, sbp: 101 }).total).toBe(1);
    expect(qsofa({ rr: 21, altered: true, sbp: 100 }).total).toBe(2);
    expect(qsofa({ rr: 21, altered: null, sbp: 120 }).total).toBeNull();
  });
});

describe("A-DROP（日本呼吸器学会）", () => {
  const base = { age: 60, sex: "男" as const, bun: 15, dehydration: false, spo2: 97, pao2: null, altered: false, sbp: 120 };
  it("年齢は男性 70・女性 75 以上", () => {
    expect(adrop({ ...base, age: 70 }).total).toBe(1);
    expect(adrop({ ...base, age: 74, sex: "女" }).total).toBe(0);
    expect(adrop({ ...base, age: 75, sex: "女" }).total).toBe(1);
  });
  it("D は BUN 21 以上または脱水、R は SpO2 90 以下または PaO2 60 以下、P は収縮期 90 以下", () => {
    expect(adrop({ ...base, bun: 21 }).total).toBe(1);
    expect(adrop({ ...base, bun: 20, dehydration: true }).total).toBe(1);
    expect(adrop({ ...base, bun: 20, dehydration: null }).total).toBeNull();
    expect(adrop({ ...base, bun: 30, dehydration: null }).total).toBe(1);
    expect(adrop({ ...base, spo2: 90 }).total).toBe(1);
    expect(adrop({ ...base, spo2: null, pao2: 60 }).total).toBe(1);
    expect(adrop({ ...base, spo2: null, pao2: null }).total).toBeNull();
    expect(adrop({ ...base, sbp: 90 }).total).toBe(1);
  });
});

describe("CURB-65", () => {
  const base = { confusion: false, bun: 10, rr: 20, sbp: 120, dbp: 70, age: 50 };
  it("尿素 > 7 mmol/L（BUN ÷ 2.8014）、呼吸数 30 以上、収縮期 < 90 または拡張期 ≤ 60、65歳以上", () => {
    expect(curb65({ ...base, bun: 19.6 }).total).toBe(0);
    expect(curb65({ ...base, bun: 19.7 }).total).toBe(1);
    expect(curb65({ ...base, rr: 30 }).total).toBe(1);
    expect(curb65({ ...base, sbp: 89 }).total).toBe(1);
    expect(curb65({ ...base, dbp: 60 }).total).toBe(1);
    expect(curb65({ ...base, age: 65 }).total).toBe(1);
    expect(curb65({ ...base, dbp: null }).total).toBeNull();
  });
});

describe("CHA₂DS₂-VASc と HAS-BLED", () => {
  it("75歳以上 2点・65〜74歳 1点・女性 1点・脳卒中 2点", () => {
    const none = { chf: false, htn: false, dm: false, stroke: false, vascular: false };
    expect(chadsVasc({ ...none, age: 75, sex: "女" }).total).toBe(3);
    expect(chadsVasc({ ...none, age: 74, sex: "男" }).total).toBe(1);
    expect(chadsVasc({ ...none, stroke: true, htn: true, age: 50, sex: "男" }).total).toBe(3);
    expect(chadsVasc({ ...none, chf: null, age: 50, sex: "男" }).total).toBeNull();
  });
  it("HAS-BLED は 65歳を超えて 1点、腎・肝、薬・飲酒は別々に1点", () => {
    const none = { htn: false, renal: false, liver: false, stroke: false, bleeding: false, labile: false, drugs: false, alcohol: false };
    expect(hasBled({ ...none, age: 65 }).total).toBe(0);
    expect(hasBled({ ...none, age: 66 }).total).toBe(1);
    expect(hasBled({ ...none, renal: true, liver: true, drugs: true, alcohol: true, age: 50 }).total).toBe(4);
  });
});

describe("Child-Pugh", () => {
  const rest = { pt: 1, ascites: 1, enceph: 1 };
  it("T-Bil 2〜3 で 2点、3 を超えて 3点。Alb 3.5 を超えて 1点、2.8 未満で 3点", () => {
    const pts = (bil: number, alb: number) => childPugh({ bil, alb, ...rest }).items.slice(0, 2).map((i) => i.points);
    expect(pts(1.9, 3.6)).toEqual([1, 1]);
    expect(pts(2, 3.5)).toEqual([2, 2]);
    expect(pts(3, 2.8)).toEqual([2, 2]);
    expect(pts(3.1, 2.7)).toEqual([3, 3]);
  });
  it("5〜6 A、7〜9 B、10〜15 C", () => {
    expect(childPugh({ bil: 1, alb: 4, ...rest }).grade).toBe("A");
    expect(childPugh({ bil: 1, alb: 4, pt: 1, ascites: 2, enceph: 2 }).grade).toBe("B");
    expect(childPugh({ bil: 4, alb: 2, pt: 2, ascites: 2, enceph: 1 }).total).toBe(11);
    expect(childPugh({ bil: 4, alb: 2, pt: 2, ascites: 2, enceph: 1 }).grade).toBe("C");
    expect(childPugh({ bil: 1, alb: 4, pt: null, ascites: 1, enceph: 1 }).grade).toBeNull();
  });
});
