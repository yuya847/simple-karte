import { describe, expect, it } from "vitest";
import { INSURANCE, type Insurance } from "./insurance";
import { ELDER_OUTPATIENT_LIMIT, kohiShare, outpatientShare, round10 } from "./futan";

const ins = (patch: Partial<Insurance>): Insurance => ({ ...INSURANCE["90010260"], ...patch });
const nov = { month: "2026-11", elder: false };

describe("10円未満の端数（健保法75条・高確法68条）", () => {
  it("五円未満は切り捨て、五円以上は切り上げ", () => {
    expect(round10(12_843)).toBe(12_840);
    expect(round10(12_845)).toBe(12_850);
    expect(round10(12_849)).toBe(12_850);
    expect(round10(0)).toBe(0);
  });
});

describe("外来の患者負担（医保）", () => {
  it("3割：128点 → 1,280円 × 0.3 = 384 → 380円", () => {
    const s = outpatientShare(128, ins({ rate: 30, limitKnown: false }), nov);
    expect(s.costYen).toBe(1_280);
    expect(s.ichibuYen).toBe(380);
    expect(s.patientYen).toBe(380);
    expect(s.limit).toBeNull();
    expect(s.notes.join("")).toContain("適用区分がわからない");
  });
  it("後期高齢者 2割（一般Ⅱ）：外来の限度額 22,000円（健保令42条5項・高確法令15条3項）", () => {
    const kouki = INSURANCE["90010198"];
    expect(ELDER_OUTPATIENT_LIMIT.一般).toBe(22_000);
    const small = outpatientShare(128, kouki, { month: "2026-11", elder: true });
    expect(small.patientYen).toBe(260);
    expect(small.limit?.yen).toBe(22_000);
    const big = outpatientShare(20_000, kouki, { month: "2026-11", elder: true }); // 200,000円 × 2割 = 40,000円
    expect(big.ichibuYen).toBe(40_000);
    expect(big.patientYen).toBe(22_000);
    expect(big.kogakuYen).toBe(18_000);
  });
  it("後期高齢者 1割・低所得Ⅱ：外来 11,000円。75歳になる月は半分", () => {
    const kouki = INSURANCE["90010244"];
    expect(outpatientShare(30_000, kouki, { month: "2026-11", elder: true }).patientYen).toBe(11_000);
    expect(outpatientShare(30_000, kouki, { month: "2026-11", elder: true, turns75ThisMonth: true }).patientYen).toBe(5_500);
  });
  it("70歳以上の現役並みは外来の特例がなく、入院と同じ額（区分ウの額 85,800円＋1%）", () => {
    const s = outpatientShare(100_000, ins({ rate: 30, incomeClass: "現役並みⅠ", limitKnown: true }), { month: "2026-11", elder: true });
    expect(s.ichibuYen).toBe(300_000);
    expect(s.limit?.yen).toBe(85_800 + Math.round((1_000_000 - 286_000) / 100));
    expect(s.limit?.source).toContain("42条3項");
  });
  it("70歳未満・区分ウ・限度額の情報あり：42条1項の額を同じ医療機関の外来に使う", () => {
    const s = outpatientShare(100_000, ins({ incomeClass: "ウ", limitKnown: true }), nov);
    expect(s.patientYen).toBe(92_940);
    expect(s.limit?.source).toContain("42条1項");
    expect(s.notes.join("")).toContain("今回の受診の分だけ");
  });
  it("適用区分がわからないときは限度額を使わない", () => {
    const s = outpatientShare(100_000, ins({ incomeClass: "ウ", limitKnown: false }), nov);
    expect(s.patientYen).toBe(300_000);
  });
});

describe("公費", () => {
  const nanbyo = { lawNo: "54", name: "指定難病", payerNumber: "54140010", recipientNumber: "1234567", rate: 20, capYen: 10_000 };
  it("指定難病（2割・上限1万円）と3割の医保：負担は 2割、上限まで", () => {
    // 1,000点 = 10,000円 → 医保 3割 3,000円 → 公費 2割 2,000円
    const s = outpatientShare(1_000, ins({ rate: 30, limitKnown: false, kohi: [nanbyo] }), nov);
    expect(s.medicalYen).toBe(3_000);
    expect(s.kohi?.rateYen).toBe(2_000);
    expect(s.patientYen).toBe(2_000);
    // 10,000点 = 100,000円 → 2割 20,000円 → 上限 10,000円
    expect(outpatientShare(10_000, ins({ rate: 30, limitKnown: false, kohi: [nanbyo] }), nov).patientYen).toBe(10_000);
  });
  it("公費の負担は医保の一部負担金を超えない（1割の医保 ＋ 2割の公費）", () => {
    const s = outpatientShare(1_000, ins({ rate: 10, limitKnown: false, kohi: [nanbyo] }), nov);
    expect(s.patientYen).toBe(1_000);
  });
  it("生活保護（医療扶助）単独：0円", () => {
    const s = outpatientShare(1_000, ins({ coverage: "生活保護", kohi: [{ lawNo: "12", name: "生活保護", payerNumber: "12140013", recipientNumber: "0000001", rate: 0, capYen: null }] }), nov);
    expect(s.patientYen).toBe(0);
    expect(s.coverage).toBe("生活保護");
  });
  it("自費は全額、労災は0円", () => {
    expect(outpatientShare(1_000, ins({ coverage: "自費" }), nov).patientYen).toBe(10_000);
    expect(outpatientShare(1_000, ins({ coverage: "労災" }), nov).patientYen).toBe(0);
  });
  it("公費が2つなら負担の少ない方で計算し、確かめるよう書く", () => {
    const k = kohiShare(10_000, 3_000, [nanbyo, { ...nanbyo, lawNo: "15", name: "更生医療", rate: 10, capYen: 5_000 }]);
    expect(k.kohi.lawNo).toBe("15");
    expect(k.patientYen).toBe(1_000);
    expect(k.note).toContain("2つ以上");
  });
});
