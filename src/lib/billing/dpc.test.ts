import { describe, expect, it } from "vitest";
import { INITIAL_DIAGNOSES } from "../diagnoses";
import { PATIENTS } from "../patients";
import { codeParts, deriveDpc, type DpcAct, type DpcInput, packagePoints, parseItemCode, periodOf } from "./dpc";
import { DPC_CLASSES } from "./dpc-table";

// Expected codes, days and points are those of the 告示 (令和８年厚生労働省告示第96号 別表) and the
// 電子点数表 (令和８年10月13日更新), read for each row:
//   080010xxxx0xxx 膿皮症 手術・処置等１なし        5/10/30日  3,133/2,247/1,910点
//   040081xx99x0xx 誤嚥性肺炎 手術なし 処置等２なし  9/17/60日  3,320/2,169/1,844点
//   050130xx9900x0 心不全 …転院以外                 7/14/60日  3,150/2,242/1,906点
//   110310xx99xxxx 腎臓又は尿路の感染症 手術なし     6/11/30日  3,232/2,257/1,918点
//   180010x0xxx0xx 敗血症（1歳以上）処置等２なし     8/16/60日  3,428/2,279/1,937点

const input = (icd10: string, over: Partial<DpcInput> = {}): DpcInput => ({ icd10, diagnosis: "試験", age: 70, acts: [], others: [], transfer: false, ...over });
const act = (kubun: string, item?: number, certain = true): DpcAct => ({ kubun, item, name: kubun, source: "試験", certain });
const code = (i: DpcInput) => {
  const r = deriveDpc(i);
  if (!r.ok) throw new Error(r.reason);
  return r.d;
};

describe("デモの4人：主病名・年齢・記録の処置から DPC コード", () => {
  const cases: [string, string, string, readonly number[], readonly number[]][] = [
    ["90010231", "L031", "080010xxxx0xxx", [5, 10, 30], [3133, 2247, 1910]],
    ["90010244", "J690", "040081xx99x0xx", [9, 17, 60], [3320, 2169, 1844]],
    ["90010198", "I509", "050130xx9900x0", [7, 14, 60], [3150, 2242, 1906]],
    ["90010260", "N10", "110310xx99xxxx", [6, 11, 30], [3232, 2257, 1918]],
  ];
  for (const [id, icd, expected, days, points] of cases) {
    it(`${PATIENTS.find((p) => p.id === id)!.name}（${icd}）→ ${expected}`, () => {
      const dx = INITIAL_DIAGNOSES[id].find((d) => d.main)!;
      expect(dx.icd10).toBe(icd);
      const d = code(input(dx.icd10!, { age: PATIENTS.find((p) => p.id === id)!.age }));
      expect(d.code).toBe(expected);
      expect(d.row.days).toEqual(days);
      expect(d.row.points).toEqual(points);
      expect(d.hokatsu).toBe(true);
      expect(d.steps.map((s) => s.digits).join("")).toBe(expected);
    });
  }

  it("佐倉さんの MRSA 菌血症（A410）を選ぶと 180010 敗血症（1歳以上）", () => {
    const d = code(input("A410", { age: 72 }));
    expect(d.code).toBe("180010x0xxx0xx");
    expect(d.row.points).toEqual([3428, 2279, 1937]);
    expect(d.issues.some((i) => i.text.includes("A410"))).toBe(true);
  });

  it("I509 にはコーディングテキストの注意（I500・I501 を区別）を出す", () => {
    expect(code(input("I509")).issues.some((i) => i.text.includes("I500"))).toBe(true);
  });
});

describe("ツリー図の分岐", () => {
  it("誤嚥性肺炎：人工呼吸（J045）で 手術・処置等２ あり", () => {
    expect(code(input("J690", { acts: [act("J045", 1)] })).code).toBe("040081xx99x1xx");
  });
  it("誤嚥性肺炎：輸血（K920、医科点数表 第10部）は手術あり（97）", () => {
    expect(code(input("J690", { acts: [act("K920", 2)] })).code).toBe("040081xx97x0xx");
  });
  it("心不全：中心静脈注射（G005）は 処置等２「２あり」、人工呼吸と両方なら下にある２", () => {
    expect(code(input("I500", { acts: [act("G005")] })).code).toBe("050130xx9902xx");
    expect(code(input("I500", { acts: [act("J045", 1), act("G005")] })).code).toBe("050130xx9902xx");
    expect(code(input("I500", { acts: [act("J045", 1)] })).code).toBe("050130xx9901xx");
  });
  it("心不全：人工腎臓は「その他の場合（J038 4）」だけが定義。慢性維持透析（項1）は当たらない", () => {
    expect(code(input("I500", { acts: [act("J038", 4)] })).code).toBe("050130xx9902xx");
    expect(code(input("I500", { acts: [act("J038", 1)] })).code).toBe("050130xx9900x0");
  });
  it("心不全：項が分からない人工腎臓は候補にだけ出す", () => {
    const d = code(input("I500", { acts: [act("J038")] }));
    expect(d.code).toBe("050130xx9900x0");
    expect(d.alternatives.map((a) => a.code)).toContain("050130xx9902xx");
  });
  it("心不全：他の病院・診療所の病棟からの転院は 14桁目が 1。記録がなければ 0 で計算し、1 を候補に出す", () => {
    expect(code(input("I500", { transfer: true })).code).toBe("050130xx9900x1");
    const d = code(input("I500", { transfer: null }));
    expect(d.code).toBe("050130xx9900x0");
    expect(d.alternatives.map((a) => a.code)).toContain("050130xx9900x1");
  });
  it("心不全：定義副傷病（敗血症 A41$、手術ありのとき）", () => {
    const others = [{ icd10: "A410", name: "敗血症" }];
    expect(code(input("I500", { acts: [act("K920", 2)], others })).code).toBe("050130xx97001x");
    expect(code(input("I500", { acts: [act("K920", 2)] })).code).toBe("050130xx97000x");
    expect(code(input("I500", { others })).code).toBe("050130xx9900x0"); // 手術なしでは分けない
  });
  it("腎盂腎炎：K775 と K783-2 の両方ならツリー図で下の K783-2（01）", () => {
    expect(code(input("N10", { acts: [act("K775")] })).code).toBe("110310xx02xxxx");
    expect(code(input("N10", { acts: [act("K775"), act("K783-2")] })).code).toBe("110310xx01xxxx");
    expect(code(input("N10", { acts: [act("K920", 2)] })).code).toBe("110310xx97xxxx");
  });
  it("膿皮症：植皮（K013 など）は手術ありで 処置等１ あり", () => {
    expect(code(input("L031", { acts: [act("K013", 1)] })).code).toBe("080010xxxx1xxx");
    expect(code(input("L031", { acts: [act("K001", 1)] })).code).toBe("080010xxxx0xxx");
  });
  it("敗血症：1歳未満は 8桁目が 1。血球成分除去療法（５あり）は包括の対象外", () => {
    expect(code(input("A419", { age: 0 })).code).toBe("180010x1xxx0xx");
    const d = code(input("A419", { acts: [act("J041-2")] }));
    expect(d.code).toBe("180010x0xxx5xx");
    expect(d.hokatsu).toBe(false);
  });
  it("表にない分類はコードを出さない。症状（R50 など）は選ばない病名として知らせる", () => {
    const r = deriveDpc(input("K359"));
    expect(r.ok).toBe(false);
    const s = deriveDpc(input("R509"));
    const issues = s.ok ? s.d.issues : s.issues;
    expect(s.ok).toBe(false);
    expect(issues.some((i) => i.text.includes("R00〜R99"))).toBe(true);
  });
});

describe("入院期間Ⅰ・Ⅱ・Ⅲ（留意事項 第2の2(1)）と入院日Ⅲを超えた日", () => {
  const row = DPC_CLASSES["080010"].rows[0]; // 5/10/30
  it.each([
    [1, "Ⅰ", 3133],
    [5, "Ⅰ", 3133],
    [6, "Ⅱ", 2247],
    [10, "Ⅱ", 2247],
    [11, "Ⅲ", 1910],
    [30, "Ⅲ", 1910],
    [31, "超え", null],
  ])("入院%i日目 → 入院期間%s（%s点）", (hd, period, points) => {
    expect(periodOf(row, hd)).toEqual({ period, points });
  });
});

describe("包括の点数 = 点数 × 医療機関別係数、月の合計の小数点以下第1位を四捨五入（留意事項 第3の1(1)）", () => {
  const row = DPC_CLASSES["080010"].rows[0];
  it("4日とも入院期間Ⅰ：3,133点 × 1.3 × 4日 = 16,291.6 → 16,292点", () => {
    const r = packagePoints(row, 1.3, [1, 2, 3, 4]);
    expect(r.lines).toEqual([{ period: "Ⅰ", from: 1, to: 4, days: 4, points: 3133, perDay: 4072.9, subtotal: 16291.6 }]);
    expect(r.total).toBe(16292);
  });
  it("期間をまたぐ月：Ⅰ 2日 + Ⅱ 5日 + Ⅲ 1日、係数 1.2345", () => {
    const r = packagePoints(row, 1.2345, [4, 5, 6, 7, 8, 9, 10, 11]);
    expect(r.lines.map((l) => [l.period, l.from, l.to, l.days])).toEqual([
      ["Ⅰ", 4, 5, 2],
      ["Ⅱ", 6, 10, 5],
      ["Ⅲ", 11, 11, 1],
    ]);
    // (3133×2 + 2247×5 + 1910×1) × 1.2345 = 19411 × 1.2345 = 23962.8795 → 23963
    expect(r.raw).toBeCloseTo(23962.8795, 6);
    expect(r.total).toBe(23963);
  });
  it("入院日Ⅲを超えた日は包括に入れない（その日は出来高）", () => {
    const r = packagePoints(row, 1.3, [29, 30, 31, 32]);
    expect(r.beyond).toEqual([31, 32]);
    expect(r.total).toBe(Math.round(1910 * 1.3 * 2));
  });
  it("ちょうど .5 は切り上げ（3,133 × 1.5 = 4,699.5 → 4,700）", () => {
    expect(packagePoints(row, 1.5, [1]).total).toBe(4700);
  });
});

describe("コードの読み方", () => {
  it("parseItemCode reads the 区分 and 項 of the official item codes", () => {
    expect(parseItemCode("J0453ｲ")).toEqual({ kubun: "J045", item: 3 });
    expect(parseItemCode("K783-2")).toEqual({ kubun: "K783-2", item: undefined });
    expect(parseItemCode("K013-21")).toEqual({ kubun: "K013-2", item: 1 });
    expect(parseItemCode("J0384")).toEqual({ kubun: "J038", item: 4 });
    expect(parseItemCode("0003")).toBeNull(); // ダミーコード（ガンマグロブリン）
  });
  it("splits the 14 digits as in the coding text", () => {
    expect(codeParts("050130xx9900x0").map((p) => p.digits)).toEqual(["050130", "x", "x", "99", "0", "0", "x", "0"]);
  });
});
