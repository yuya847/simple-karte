import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ReceiptSheet } from "../../components/billing/ReceiptSheet";
import { receiptSheet } from "./receipt-sheet";
import { describe, expect, it } from "vitest";
import type { LabOrder, OrderEntry, ProcedureOrder } from "../types";
import { calculateClaim } from "./engine";
import { INSURANCE } from "./insurance";
import { DEFAULT_OPTIONS } from "./model";
import { buildUke, num, receiptRecords, toZenkaku, type Receipt } from "./uke";

const lab: OrderEntry = {
  kind: "order",
  id: "l1",
  day: -3,
  time: "09:00",
  author: "試験",
  status: "有効",
  order: { type: "lab", codes: ["SET-ROUTINE"], collect: { day: -3, time: "14:00" }, priority: "定時" } as LabOrder,
};

// 森 久美子 (fictional): 協会けんぽ 家族 3割 区分ウ. Admitted 2026-10-30, claim for October.
const claim = calculateClaim({
  today: "2026-11-02",
  nowTime: "10:00",
  month: "2026-10",
  patient: { id: "90010260", name: "森 久美子", sex: "女", age: 64, admittedOn: -3 },
  entries: [lab],
  daily: [
    { day: -3, meals: [null, null, 5] },
    { day: -2, meals: [10, 10, 10] },
  ],
  cultures: [],
  diagnoses: [],
  options: DEFAULT_OPTIONS,
});

const receipt: Receipt = {
  patient: { id: "90010260", name: "森 久美子", kana: "モリ クミコ", sex: "女", admittedDate: "2026-10-30", insurance: INSURANCE["90010260"], ageAtMonth: 64, preschool: false },
  claim,
  diagnoses: [
    { id: "d1", code: "5901002", name: "急性腎盂腎炎", prefixes: [], suffixes: [], main: true, start: -3, outcome: "継続", startDate: "2026-10-30" },
    { id: "d2", code: "0000999", name: "腰痛の訴え", prefixes: [], suffixes: [], main: false, start: -3, outcome: "継続", startDate: "2026-10-30" },
  ],
  window: { medicalYen: 80100, kogaku: true, tasuu: false },
};

describe("number fields (数字モード)", () => {
  it("drop leading and trailing zeros", () => {
    expect(num(2, 5)).toBe("2");
    expect(num(0.5, 5)).toBe("0.5");
    expect(num(1.1, 5)).toBe("1.1");
    expect(num(103)).toBe("103");
  });
  it("names are all 全角 with a 全角 space", () => expect(toZenkaku("森 久美子")).toBe("森　久美子"));
});

describe("one inpatient receipt", () => {
  const lines = receiptRecords(receipt, 1, "2026-10");

  it("RE: 1115 (家族・入院), 区ウ, 入院年月日, katakana without a space", () => {
    const re = lines[0].split(",");
    expect(re).toHaveLength(38);
    expect(re.slice(0, 7)).toEqual(["RE", "1", "1115", "202610", "森　久美子", "2", "19620315"]);
    expect(re[8]).toBe("20261030");
    expect(re[11]).toBe("28");
    expect(re[36]).toBe("モリクミコ");
  });

  it("HO: 実日数 2, 合計点数, 食数 4, 食事療養費, 負担金額 with 高額療養費 現物給付", () => {
    const ho = lines[1].split(",");
    expect(ho).toHaveLength(15);
    expect(ho[4]).toBe("2");
    expect(ho[5]).toBe(String(claim.totalPoints));
    expect(ho[7]).toBe("4");
    expect(ho[8]).toBe(String(730 * 4));
    expect(ho[11]).toBe("80100");
  });

  it("SN, JD (30・31日), MF 01", () => {
    expect(lines[2]).toBe("SN,1,01,,,,01,,");
    const jd = lines[3].split(",");
    expect(jd).toHaveLength(33);
    expect(jd[31]).toBe("1");
    expect(jd[32]).toBe("1");
    expect(lines[4].startsWith("MF,01,")).toBe(true);
  });

  it("SY: 主傷病 01, 未コード化 has its name", () => {
    expect(lines[5]).toBe("SY,5901002,20261030,1,,,01,");
    expect(lines[6]).toBe("SY,0000999,20261030,1,,腰痛の訴え,,");
  });

  it("包括の生化学 is one unit: points (103+20) only on its last record", () => {
    const chem = lines.filter((l) => /^SI,(60)?,1,(1600(17410|18910|22510|22610|19510|20010|17010|19010|19210|21110|21410|19410)|160161510),/.test(l));
    expect(chem).toHaveLength(13);
    expect(chem[0].split(",")[1]).toBe("60");
    expect(chem.slice(0, 12).every((l) => l.split(",")[5] === "")).toBe(true);
    expect(chem[12].split(",")[5]).toBe("123");
  });

  it("97: 数量データ is the day's meals, 標準負担額 its own unit", () => {
    const meals = lines.filter((l) => /^SI,(97)?,1,1970/.test(l));
    expect(meals.map((l) => l.split(",").slice(1, 7).join(","))).toEqual([
      "97,1,197000110,1,730,1",
      ",1,197000810,1,550,1",
      "97,1,197000110,3,2190,1",
      ",1,197000810,3,1650,1",
    ]);
  });
});

describe("the file", () => {
  const file = buildUke([receipt], "1", "2026-10", "2026-11");

  it("IR first, GO last, CR LF after every record and 1A at the end", () => {
    expect(file.text.startsWith("IR,1,14,1,9900010,,架空総合病院,202611,00,045-000-0000\r\n")).toBe(true);
    expect(file.text.endsWith(`GO,1,${claim.totalPoints},99\r\n`)).toBe(true);
    expect(file.bytes[file.bytes.length - 1]).toBe(0x1a);
    expect(file.bytes[file.bytes.length - 2]).toBe(0x0a);
  });

  it("passes the file checks, apart from the 未コード化傷病名 it reports", () => {
    expect(file.problems).toHaveLength(1);
    expect(file.problems[0]).toContain("未コード化傷病名");
  });

  it("a 国保 patient goes to the other file", () => {
    expect(buildUke([receipt], "2", "2026-10", "2026-11").count).toBe(0);
  });
});

describe("処置の特定器材（TO）", () => {
  const procs: OrderEntry[] = [
    {
      kind: "order",
      id: "o2",
      day: -2,
      time: "09:00",
      author: "試験",
      status: "中止",
      stoppedOn: -2,
      stoppedTime: "19:00",
      order: { type: "procedure", code: "PROC-O2", o2: { device: "鼻カニュラ", lpm: 2 }, schedule: { kind: "continuous" }, start: { day: -2, time: "09:00" } } as ProcedureOrder,
    },
    {
      kind: "order",
      id: "foley",
      day: -2,
      time: "09:00",
      author: "試験",
      status: "有効",
      order: { type: "procedure", code: "PROC-FOLEY", schedule: { kind: "continuous" }, start: { day: -2, time: "09:30" } } as ProcedureOrder,
    },
  ];
  const c = calculateClaim({
    today: "2026-11-02",
    nowTime: "10:00",
    month: "2026-10",
    patient: { id: "90010260", name: "森 久美子", sex: "女", age: 64, admittedOn: -3 },
    entries: procs,
    daily: [],
    cultures: [],
    diagnoses: [],
    options: DEFAULT_OPTIONS,
  });
  const lines = receiptRecords({ ...receipt, claim: c }, 1, "2026-10");
  const sk40 = lines.findIndex((l) => l.startsWith("SI,40,"));

  it("酸素: SI 酸素吸入 65, then TO 酸素 (使用量 1200L, 単価 0.16) and TO 補正率 with the points", () => {
    // 10/31 09:00–19:00 = 600分 × 2L = 1,200L → 0.16 × 1200 × 1.3 = 249.6 → 250円 → 25点
    const [si, ox, corr] = lines.slice(sk40, sk40 + 3).map((l) => l.split(","));
    expect(si.slice(0, 7)).toEqual(["SI", "40", "1", "140005610", "", "65", "1"]);
    expect(ox).toHaveLength(48);
    expect(ox.slice(0, 11)).toEqual(["TO", "", "1", "739200000", "1200", "", "1", "", "0.16", "", ""]);
    expect(corr.slice(0, 7)).toEqual(["TO", "", "1", "770020070", "", "25", "1"]);
    expect(corr[47]).toBe("1"); // 31日
  });

  it("カテーテル: a new 40 unit, 単位コード 007（本） and the product name in 全角", () => {
    const i = lines.findIndex((l, k) => k > sk40 && l.startsWith("SI,40,1,140013810"));
    const to = lines[i + 1].split(",");
    expect(to.slice(0, 11)).toEqual(["TO", "", "1", "710010158", "1", "23", "1", "007", "", "", "２管バルーンカテーテル　１６Ｆｒ"]);
  });

  it("the file check passes (field counts, 回数 = 算定日の合計)", () => {
    const f = buildUke([{ ...receipt, claim: c }], "1", "2026-10", "2026-11");
    // (the fixture's 未コード化傷病名 is reported on purpose; no record-level problem)
    expect(f.problems.filter((p) => /行目/.test(p))).toEqual([]);
  });
});

describe("病名の補足コメントと確認", () => {
  it("出さないチェックで補足コメントだけを伏せる", () => {
    const d = { ...receipt.diagnoses[0], comment:"経過を確認" };
    const visible = receiptRecords({...receipt,diagnoses:[d]},1,"2026-10").find(s=>s.startsWith("SY,"))!;
    const hidden = receiptRecords({...receipt,diagnoses:[{...d,hideCommentOnClaim:true}]},1,"2026-10").find(s=>s.startsWith("SY,"))!;
    expect(visible.split(",")[7]).toBe("経過を確認");
    expect(hidden.split(",")[7]).toBe("");
  });
  it("確認前の病名を直接渡されても SY に出さない", () => {
    const records = receiptRecords({...receipt,diagnoses:receipt.diagnoses.map(d=>({...d,auto:{from:"記事" as const,at:"now"}}))},1,"2026-10");
    expect(records.some(s=>s.startsWith("SY,"))).toBe(false);
  });
});


describe("紙の明細書", () => {
  it("主要欄、病名、数量と算定日が読め、合計と食数はUKEと一致する", () => {
    const lines = receiptRecords(receipt, 1, claim.month);
    const d = receiptSheet(receipt, lines);
    const ho = lines.find(l => l.startsWith("HO,"))!.split(",");
    expect(d.totalPoints).toBe(Number(ho[5]));
    expect(d.meals).toBe(Number(ho[7]));
    expect(d.rows.filter(r => r.group !== "97").reduce((s,r) => s + (r.points ?? 0) * r.count, 0)).toBe(d.totalPoints);
    expect(d.rows.every(r => r.days.reduce<number>((s,v) => s + (v ?? 0), 0) === r.count)).toBe(true);
    const html = renderToStaticMarkup(createElement(ReceiptSheet, { data: d }));
    for (const field of ["請求月", "医療機関", "保険者番号", "本人・家族", "給付割合", "氏名", "性別", "生年月日", "公費", "特記事項", "開始日", "転帰", "品名・規格", "数量", "点数×回数", "算定日", "合計点数", "一部負担金", "標準負担額", "◎", "急性腎盂腎炎"]) expect(html).toContain(field);
  });
  it("既存点検のコードがある行だけに印を付ける", () => {
    const code = claim.acts[0].parts[0].lines[0].code;
    const r = { ...receipt, claim: { ...claim, issues: [{ level: "review" as const, text: "既存の上限回数の指摘", codes: [code] }] } };
    const d = receiptSheet(r, receiptRecords(r, 1, claim.month));
    expect(d.rows.filter(r => r.checks.length).every(r => r.code === code)).toBe(true);
    expect(d.rows.some(r => r.checks.includes("既存の上限回数の指摘"))).toBe(true);
  });
});
