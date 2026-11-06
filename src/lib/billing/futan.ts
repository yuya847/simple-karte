// 患者負担 (what the patient pays at the window) from the points, for the 外来 visit and, for 公費, the
// inpatient bill too. Pure functions: no master is read here, so the screens can call them directly.
//
// 一部負担金 = 点数 × 10円 × 負担割合, 10円未満四捨五入 (五円未満切り捨て・五円以上十円未満切り上げ:
// 健康保険法75条、高齢者の医療の確保に関する法律68条). The 負担割合 follows 健康保険法74条1項 (70歳未満 3割、
// 70歳以上 2割・現役並み 3割; 未就学 2割は110条2項) and 高確法67条1項 (後期高齢者 1割・2割・3割).
// 高額療養費 at the window (現物給付, 健保令43条): 70歳未満 — 健保令42条1項 per 医療機関, 入院と外来は別
// (43条); 70歳以上の外来（個人） — 42条5項: 一般 22,000円、低所得Ⅱ 11,000円、低所得Ⅰ 8,000円 (現役並みは
// 外来の特例がなく 42条3項の額); 後期高齢者 — 高確法令15条3項に同じ額. Both texts were read on e-Gov
// (2026-10-01 施行版: 令和8年政令第276号・第274号) on 2026-11-04.
// 公費負担医療: the patient pays the 制度's share of the cost — 指定難病 2割 (難病法5条2項1号), 自立支援医療
// 1割 (障害者総合支援法58条3項1号), 小児慢性特定疾病 2割 (児童福祉法19条の2第2項1号), 結核の適正医療
// 5% (感染症法37条の2: 公費が95%), 生活保護の医療扶助 (生活保護法15条) — up to the 自己負担上限月額 on the
// 受給者証, and never more than the 医保 part.

import { coverageOf, type Coverage, type Insurance, type Kohi } from "./insurance";
import { limitFor, limitTableFor } from "./kaikei";

export const round10 = (yen: number) => Math.floor((yen + 5) / 10) * 10;

export const FUTAN_SOURCES = [
  { label: "健康保険法 第74条・第75条（一部負担金の割合と10円未満の端数）", url: "https://laws.e-gov.go.jp/law/211AC0000000070" },
  { label: "高齢者の医療の確保に関する法律 第67条・第68条（後期高齢者の一部負担金）", url: "https://laws.e-gov.go.jp/law/357AC0000000080" },
  { label: "健康保険法施行令 第41条〜第43条（高額療養費算定基準額。70歳以上の外来は42条5項）", url: "https://laws.e-gov.go.jp/law/215IO0000000243" },
  { label: "高齢者の医療の確保に関する法律施行令 第14条・第15条（後期高齢者の高額療養費算定基準額）", url: "https://laws.e-gov.go.jp/law/419CO0000000318" },
  { label: "難病の患者に対する医療等に関する法律 第5条（特定医療費：患者の負担は2割まで）", url: "https://laws.e-gov.go.jp/law/426AC0000000050" },
  { label: "障害者の日常生活及び社会生活を総合的に支援するための法律 第58条（自立支援医療費：患者の負担は1割まで）", url: "https://laws.e-gov.go.jp/law/417AC0000000123" },
  { label: "児童福祉法 第19条の2（小児慢性特定疾病医療費：患者の負担は2割まで）", url: "https://laws.e-gov.go.jp/law/322AC0000000164" },
  { label: "感染症の予防及び感染症の患者に対する医療に関する法律 第37条の2（結核の適正医療：費用の95%を公費）", url: "https://laws.e-gov.go.jp/law/410AC0000000114" },
  { label: "生活保護法 第15条（医療扶助）", url: "https://laws.e-gov.go.jp/law/325AC0000000144" },
];

/** The 公費 this prototype knows, with the patient's share after 医保. 法別番号 as on the 受給者証. */
export const KOHI_KINDS: { lawNo: string; name: string; rate: number; cap: "受給者証" | "なし"; basis: string }[] = [
  { lawNo: "12", name: "生活保護（医療扶助）", rate: 0, cap: "なし", basis: "生活保護法15条。本人支払額は福祉事務所が決める（この試作では 0 円）" },
  { lawNo: "54", name: "指定難病（特定医療費）", rate: 20, cap: "受給者証", basis: "難病法5条2項1号：患者の負担は費用の2割まで。上限月額は受給者証" },
  { lawNo: "15", name: "自立支援医療（更生医療）", rate: 10, cap: "受給者証", basis: "障害者総合支援法58条3項1号：患者の負担は費用の1割まで。上限月額は受給者証" },
  { lawNo: "16", name: "自立支援医療（育成医療）", rate: 10, cap: "受給者証", basis: "障害者総合支援法58条3項1号" },
  { lawNo: "21", name: "自立支援医療（精神通院医療）", rate: 10, cap: "受給者証", basis: "障害者総合支援法58条3項1号" },
  { lawNo: "52", name: "小児慢性特定疾病医療支援", rate: 20, cap: "受給者証", basis: "児童福祉法19条の2第2項1号：患者の負担は費用の2割まで" },
  { lawNo: "10", name: "結核患者の適正医療", rate: 5, cap: "なし", basis: "感染症法37条の2：費用の95%を公費が負担" },
];

export const kohiKind = (lawNo: string) => KOHI_KINDS.find((k) => k.lawNo === lawNo);

/** What the window says about a visit without 医保. */
export const NON_MEDICAL_NOTE: Record<Coverage, string> = {
  医保: "",
  生活保護: "生活保護（医療扶助）：患者の支払いは 0 円で計算しています（本人支払額がある人は福祉事務所の医療券に書かれます。この試作では扱いません）。費用は福祉事務所に請求します。",
  自費: "自費：保険を使わないので、点数 × 10円の全額をお支払いいただきます（自由診療の価格表はこの試作にはありません）。",
  労災: "労災：患者の窓口負担はありません。費用は労災保険（労働基準監督署）に請求します。労災の点数表（1点12円など）はこの試作では算定しません。",
  公費のみ: "医保のない公費単独：公費の負担割合と上限で患者負担を計算しています。",
};

export interface KohiShare {
  kohi: Kohi;
  /** 公費の負担割合で計算した額（10円未満四捨五入）. */
  rateYen: number;
  /** After the 上限月額 (null when the 制度 has none). */
  patientYen: number;
  note: string;
}

/**
 * The patient's share with 公費: the 公費's rate of the cost, capped by its 上限月額 and by the 医保 part
 * (保険優先: the 公費 pays what 医保 leaves, so the patient never pays more than the 医保 一部負担金).
 */
export function kohiShare(costYen: number, medicalPartYen: number, kohis: Kohi[]): KohiShare {
  // With more than one 公費, the one that leaves the patient the least applies here; a person checks the order.
  const shares = kohis.map((k) => {
    const rateYen = Math.min(round10((costYen * k.rate) / 100), medicalPartYen);
    const patientYen = k.capYen === null ? rateYen : Math.min(rateYen, k.capYen);
    return { kohi: k, rateYen, patientYen };
  });
  const best = shares.sort((a, b) => a.patientYen - b.patientYen)[0];
  const k = best.kohi;
  const f = (n: number) => n.toLocaleString("ja-JP");
  const capText = k.capYen === null ? "上限月額なし" : `上限月額 ${f(k.capYen)}円${best.rateYen > k.capYen ? "（上限まで）" : ""}`;
  return {
    ...best,
    note: `公費 ${k.lawNo} ${k.name}：患者の負担は費用の${k.rate}%（${f(best.rateYen)}円）、${capText}。上限は同じ月のほかの医療機関・薬局の支払いと合わせて数えるので、自己負担上限額管理票で確かめてください。${kohis.length > 1 ? "公費が2つ以上あるので、負担の最も少ない1つで計算しています（併用の順は人が確かめる）。" : ""}`,
  };
}

export interface OutpatientShare {
  points: number;
  costYen: number;
  coverage: Coverage;
  rate: number;
  /** 一部負担金 before any limit (医保のみ). */
  ichibuYen: number;
  limit: { yen: number; formula: string; source: string } | null;
  /** The 医保 part after the limit (= what the patient pays without 公費). */
  medicalYen: number;
  kohi: KohiShare | null;
  /** What the patient pays at the window for this visit. */
  patientYen: number;
  /** Paid by the insurer as 高額療養費 at the window (現物給付). */
  kogakuYen: number;
  notes: string[];
}

export interface ShareContext {
  /** Claim month "YYYY-MM". */
  month: string;
  /** 70歳に達する日の属する月の翌月以後 (or 後期高齢者). */
  elder: boolean;
  /** The 75th birthday is in this month (限度額は半分: 健保令42条5項かっこ書き). */
  turns75ThisMonth?: boolean;
}

/** 70歳以上の外来（個人）の算定基準額: 健保令42条5項・高確法令15条3項 (2026-10-01 施行版). */
export const ELDER_OUTPATIENT_LIMIT: Record<"一般" | "低所得Ⅱ" | "低所得Ⅰ", number> = { 一般: 22_000, 低所得Ⅱ: 11_000, 低所得Ⅰ: 8_000 };

function elderOutpatientLimit(ins: Insurance, costYen: number, month: string, half: boolean): { yen: number; formula: string; source: string } | null {
  const c = ins.incomeClass;
  if (c.startsWith("現役並み")) {
    // No 外来の特例 for 現役並み: the 世帯 amount of 42条3項 (the same figures as 入院) applies.
    const l = limitFor(ins, costYen, month, false);
    return l ? { ...l, source: `健康保険法施行令42条3項・高齢者の医療の確保に関する法律施行令15条1項（現役並み所得者は外来の特例なし）。${limitTableFor(month).source}` } : null;
  }
  const row = c === "低所得Ⅱ" || c === "低所得Ⅰ" ? c : c === "一般" || c === "一般Ⅱ" || c === "一般Ⅰ" ? "一般" : null;
  if (!row) return null;
  const base = ELDER_OUTPATIENT_LIMIT[row];
  const yen = half ? base / 2 : base;
  return { yen, formula: `${row}（70歳以上・外来・個人）${yen.toLocaleString("ja-JP")}円${half ? "（75歳になる月：2分の1）" : ""}`, source: "健康保険法施行令42条5項・高齢者の医療の確保に関する法律施行令15条3項（2026年10月1日施行版）" };
}

/** What the patient pays for one outpatient visit, from the visit's points and the registered insurance. */
export function outpatientShare(points: number, ins: Insurance, ctx: ShareContext): OutpatientShare {
  const costYen = points * 10;
  const coverage = coverageOf(ins);
  const notes: string[] = [];
  const none = { points, costYen, coverage, limit: null, kohi: null, kogakuYen: 0 };
  if (coverage === "自費") return { ...none, rate: 100, ichibuYen: costYen, medicalYen: costYen, patientYen: costYen, notes: [NON_MEDICAL_NOTE.自費] };
  if (coverage === "労災") return { ...none, rate: 0, ichibuYen: 0, medicalYen: 0, patientYen: 0, notes: [NON_MEDICAL_NOTE.労災] };
  if (coverage === "生活保護" || coverage === "公費のみ") {
    const kohis = ins.kohi ?? [];
    if (!kohis.length) return { ...none, rate: 0, ichibuYen: 0, medicalYen: 0, patientYen: 0, notes: [NON_MEDICAL_NOTE[coverage], "受給者証（公費）が登録されていません。患者基本情報の「保険・制度」で入れてください。"] };
    const k = kohiShare(costYen, costYen, kohis);
    return { ...none, rate: k.kohi.rate, ichibuYen: k.rateYen, medicalYen: costYen, kohi: k, patientYen: k.patientYen, notes: [NON_MEDICAL_NOTE[coverage], k.note] };
  }
  // 医保
  const ichibuYen = round10((costYen * ins.rate) / 100);
  let limit: OutpatientShare["limit"] = null;
  if (ins.limitKnown) limit = ctx.elder ? elderOutpatientLimit(ins, costYen, ctx.month, !!ctx.turns75ThisMonth) : limitFor(ins, costYen, ctx.month, false);
  else notes.push("適用区分がわからないため、高額療養費は窓口では差し引いていません（限度額適用認定証の提示か、マイナ保険証での情報提供が要ります）。あとで保険者に申請すれば払い戻されます。");
  if (!ctx.elder && limit) limit = { ...limit, source: `健康保険法施行令42条1項（70歳未満。同じ医療機関で、入院と外来は別に数える：43条）。${limit.source}` };
  if (ctx.turns75ThisMonth && !ctx.elder) notes.push("75歳になる月は限度額が半分になる特例があります（健保令42条）。この計算には入れていないので確かめてください。");
  const kogaku = !!limit && ichibuYen > limit.yen;
  const medicalYen = kogaku ? limit!.yen : ichibuYen;
  if (kogaku) notes.push("同じ月に同じ医療機関で払った外来の一部負担金の合計で限度額を見ます。この試作は今回の受診の分だけで計算しています（月のほかの受診は足していません）。");
  const kohi = ins.kohi?.length ? kohiShare(costYen, medicalYen, ins.kohi) : null;
  if (kohi) notes.push(kohi.note);
  return {
    points,
    costYen,
    coverage,
    rate: ins.rate,
    ichibuYen,
    limit,
    medicalYen,
    kohi,
    patientYen: kohi ? kohi.patientYen : medicalYen,
    kogakuYen: kogaku ? ichibuYen - medicalYen : 0,
    notes,
  };
}
