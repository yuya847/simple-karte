import { patternDay, rxLastDay } from "../day-pattern";
// 病名漏れの「候補」。適応・査定の確定や病名の自動登録は行わない。
// ICD は病名の探索範囲。薬ごとの用量・菌種・併用条件までは判定しない。
// 疑い可否・対象日ごとの照合・同じ品目の月内集約は、この画面の点検方針。
import { diagnosisClaimable, diagnosisLabel, isSuspected, type Diagnosis } from "../diagnoses";
import { classOf, docUrl } from "../drug-class";
import { DRUGS, ORAL_DRUGS, LAB_TESTS, findDrug, findLab, findSet, WARD_RULES } from "../master";
import { minutesOf } from "../dates";
import { doseTimes } from "../flowsheet";
import type { HistoryEntry, OrderEntry } from "../types";

export interface DiseaseMatch { icd?: string[]; words?: string[] }
export interface DiseaseRule {
  id: string;
  kind: "drug" | "lab";
  codes: string[];
  label: string;
  example: string;
  suspected: boolean;
  any: DiseaseMatch[];
  /** 終了した潰瘍病名も、対象日より前の既往として照合する。併用だけでは足りない。 */
  ulcerPrevention?: boolean;
  source: string;
}
const notice = "https://www.mhlw.go.jp/content/12400000/001757385.pdf";
const diabetes: DiseaseMatch = { icd: ["E10-E14", "O24"], words: ["糖尿病"] };
const infection: DiseaseMatch = { icd: ["A00-A49", "J00-J22", "N10-N12", "N30", "N390", "L00-L08"], words: ["感染", "肺炎", "菌血症", "敗血症", "腎盂腎炎", "膀胱炎", "蜂巣炎", "蜂窩織炎", "胆管炎", "胆嚢炎", "腹膜炎", "膿瘍", "骨髄炎", "中耳炎", "副鼻腔炎", "扁桃炎"] };
const cancer: DiseaseMatch = { icd: ["C00-C97", "D00-D09"], words: ["癌", "がん", "悪性", "白血病", "リンパ腫", "骨髄腫"] };

/** 人が編集するルール表。PMDA の各電子添文「4. 効能又は効果」。
 * drug-class.ts の一般名・薬効分類に対応する採用品目を列挙し、過度な分類の一括適用を避ける。
 * 2026-11-06 確認。インスリンはデモ品目なので、糖尿病治療という分類だけを用いる。
 */
export const DISEASE_RULES: DiseaseRule[] = [
  { id: "insulin", kind: "drug", codes: DRUGS.filter(d => d.category === "インスリン").map(d => d.code), label: "インスリン", example: "糖尿病", suspected: false, any: [diabetes], source: "https://www.mhlw.go.jp/stf/newpage_48922.html" },
  // ジャヌビアは2型。メトグルコの多嚢胞性卵巣症候群の適応も落とさない。
  { id: "sitagliptin", kind: "drug", codes: ["ORAL-SITA50"], label: "糖尿病用剤", example: "2型糖尿病", suspected: false, any: [{ icd: ["E11"], words: ["２型糖尿病", "2型糖尿病", "インスリン非依存型糖尿病"] }], source: docUrl("januvia") },
  { id: "metformin", kind: "drug", codes: ["ORAL-MET250"], label: "糖尿病用剤", example: "2型糖尿病・多嚢胞性卵巣症候群", suspected: false, any: [{ icd: ["E11", "E282"], words: ["２型糖尿病", "2型糖尿病", "多嚢胞性卵巣"] }], source: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/ResultDataSetPDF/400093_3962002F2027_1_22" },
  // ラシックスは高血圧・心性/腎性/肝性浮腫・結石等。腎の語だけで全腎疾患を適応としない。
  { id: "loop", kind: "drug", codes: ["INJ-FRS20", "ORAL-FRS20"], label: "ループ利尿薬", example: "心不全・浮腫・高血圧症", suspected: false, any: [{ icd: ["I10-I15", "I50", "R60", "N04", "N20-N23"], words: ["浮腫", "心不全", "高血圧", "ネフローゼ", "月経前緊張症"] }], source: "https://www.pmda.go.jp/files/000211666.pdf" },
  // セファメジン等の適応症・手引き第四版 医科入院編。菌種や個別適応の審査はしない。
  // 周術期・ST合剤の予防は別の文脈が必要なので、曖昧な自由記載から自動免除しない。
  { id: "antibiotic", kind: "drug", codes: ["INJ-VCM05", "INJ-CEZ1", "INJ-SBTABPC3", "INJ-CTRX1", "ORAL-AMPC250", "ORAL-AMCL250", "ORAL-LVFX500", "ORAL-CFPN100", "ORAL-AZM250", "ORAL-ST"], label: "抗菌薬", example: "感染症（肺炎・尿路感染症など）", suspected: false, any: [infection], source: "https://www.mhlw.go.jp/content/10906000/001582921.pdf" },
  // 4・5節: 再発抑制は潰瘍の既往＋NSAIDs/低用量アスピリン。抗血小板薬全般には広げない。
  { id: "ppi", kind: "drug", codes: ["ORAL-ESOM20", "ORAL-LPZ15"], label: "PPI（胃酸を抑える薬）", example: "胃潰瘍・逆流性食道炎・潰瘍の再発抑制", suspected: false, any: [{ icd: ["K21", "K25-K28", "E164"], words: ["逆流性食道炎", "胃食道逆流", "胃潰瘍", "十二指腸潰瘍", "吻合部潰瘍", "Zollinger", "ゾリンジャー", "ピロリ", "胃MALTリンパ腫", "特発性血小板減少性紫斑病", "内視鏡的治療後胃"] }], ulcerPrevention: true, source: docUrl("nexium") },
  { id: "apixaban", kind: "drug", codes: ["ORAL-API25"], label: "抗凝固薬", example: "心房細動・深部静脈血栓症・肺血栓塞栓症", suspected: false, any: [{ icd: ["I48", "I26", "I80-I82"], words: ["心房細動", "深部静脈血栓", "肺血栓", "肺塞栓", "静脈血栓塞栓"] }], source: docUrl("eliquis") },
  { id: "warfarin", kind: "drug", codes: ["ORAL-WAR1"], label: "抗凝固薬", example: "心房細動・血栓塞栓症・人工弁置換後", suspected: false, any: [{ icd: ["I48", "I26", "I80-I82", "I21", "I633", "I634", "Z952"], words: ["血栓", "塞栓", "心房細動", "弁置換", "心筋梗塞"] }], source: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/ResultDataSetPDF/170033_3332001D1023_1_13" },
  // リクシアナには下肢整形外科手術後の予防・CTEPHもある（他のDOACと一括しない）。
  { id: "edoxaban", kind: "drug", codes: ["ORAL-EDO30"], label: "抗凝固薬", example: "心房細動・静脈血栓塞栓症・下肢整形外科手術後", suspected: false, any: [{ icd: ["I48", "I26", "I80-I82"], words: ["心房細動", "静脈血栓", "肺血栓", "肺塞栓", "下肢整形外科手術後", "人工膝関節置換術後", "人工股関節置換術後", "股関節骨折手術後"] }], source: docUrl("lixiana") },
  // 各電子添文4節: 薬効名だけで高血圧/脂質/睡眠の病名をまとめて推測しない。
  { id: "amlodipine", kind: "drug", codes: ["ORAL-AMLO5"], label: "Ca拮抗薬", example: "高血圧症・狭心症", suspected: false, any: [{ icd: ["I10-I15", "I20"], words: ["高血圧", "狭心症"] }], source: "https://www.mhlw.go.jp/content/11120000/001015136.pdf" },
  { id: "statin", kind: "drug", codes: ["ORAL-ATOR10", "ORAL-ROSU25"], label: "スタチン", example: "脂質異常症・高コレステロール血症", suspected: false, any: [{ icd: ["E78"], words: ["脂質異常", "高脂血症", "高コレステロール"] }], source: docUrl("lipitor") },
  { id: "sleep", kind: "drug", codes: ["ORAL-ZOL5", "ORAL-SUV15"], label: "睡眠薬", example: "不眠症", suspected: false, any: [{ icd: ["G470", "F510"], words: ["不眠症"] }], source: docUrl("belsomra") },
  // 以下は検査目的の点検。疑いを許容する方針であり「疑いがあれば必ず算定可能」ではない。
  { id: "hba1c", kind: "lab", codes: ["LAB-HBA1C", "LAB-GA"], label: "糖代謝検査", example: "糖尿病", suspected: true, any: [diabetes], source: "https://www.pmda.go.jp/PmdaSearch/ivdDetail/ResultDataSetPDF/181346_13E1X00002000065_A_01_04" },
  // D008(7): 心不全の診断・病態把握。回数制限は既存の算定側で扱う。
  { id: "bnp", kind: "lab", codes: ["LAB-BNP", "LAB-NTBNP"], label: "心不全の検査", example: "心不全", suspected: true, any: [{ icd: ["I50", "I110", "I130", "I132"], words: ["心不全"] }], source: notice + "#page=362" },
  // FT4の診断補助: https://www.info.pmda.go.jp/downfiles/ivd/PDF/480585_21900AMX01768000_A_09_01.pdf
  // TSH・FT4・FT3: 甲状腺ホルモン/刺激ホルモンの測定目的。D008内分泌検査。
  { id: "thyroid", kind: "lab", codes: ["LAB-TSH", "LAB-FT4", "LAB-FT3", "LAB-TRAB", "LAB-TPOAB", "LAB-TGAB"], label: "甲状腺の検査", example: "甲状腺疾患", suspected: true, any: [{ icd: ["E00-E07", "C73", "D34"], words: ["甲状腺", "バセドウ", "橋本病"] }], source: "https://www.pmda.go.jp/PmdaSearch/ivdDetail/ResultDataSetPDF/181346_13E1X00002000031_A_01_06" },
  // D009(1)(4): 悪性腫瘍の診断。PSAは前立腺癌に限定する。
  { id: "tumor", kind: "lab", codes: ["LAB-CA199", "LAB-CA153", "LAB-CYFRA", "LAB-PROGRP", "LAB-SCC", "LAB-NSE"], label: "腫瘍マーカー", example: "悪性腫瘍", suspected: true, any: [cancer], source: notice + "#page=364" },
  { id: "psa", kind: "lab", codes: ["LAB-PSA"], label: "腫瘍マーカー", example: "前立腺癌", suspected: true, any: [{ icd: ["C61"], words: ["前立腺癌", "前立腺がん"] }], source: notice + "#page=365" },
  // D009(1)イ・ウ・エ: 非悪性の使用目的も候補から除く。
  { id: "liver-marker", kind: "lab", codes: ["LAB-AFP", "LAB-PIVKA"], label: "腫瘍マーカー", example: "悪性腫瘍・肝硬変・慢性肝炎", suspected: true, any: [cancer, { icd: ["K74", "B18"], words: ["肝硬変", "慢性肝炎"] }], source: notice + "#page=365" },
  { id: "ca125", kind: "lab", codes: ["LAB-CA125"], label: "腫瘍マーカー", example: "悪性腫瘍・子宮内膜症", suspected: true, any: [cancer, { icd: ["N80"], words: ["子宮内膜症"] }], source: notice + "#page=365" },
  { id: "cea", kind: "lab", codes: ["LAB-CEA"], label: "腫瘍マーカー", example: "悪性腫瘍・家族性大腸腺腫症", suspected: true, any: [cancer, { words: ["家族性大腸腺腫症"] }], source: notice + "#page=365" },
  // 厚労省 抗微生物薬適正使用の手引き第四版 医科入院編: 血流感染の診断/陰性化確認。
  // 肺炎・腎盂腎炎等でも採取するので、敗血症だけの病名追加を強制しない。
  { id: "blood-culture", kind: "lab", codes: ["LAB-BCX"], label: "血液培養", example: "敗血症・菌血症・感染症", suspected: true, any: [infection, { words: ["心内膜炎", "不明熱"] }], source: "https://www.mhlw.go.jp/content/10906000/001582921.pdf" },
];

/** 全採用品目を確認するための棚卸し。点検なしは「病名不要/適応あり」という意味ではない。
 * 一般検査や補液・ロックは特定病名に限定せず、個別根拠の未確認品は無理に規則化しない。
 * マスター追加時はテストで未整理を検知する。
 */
export const DISEASE_CHECK_EXCLUSIONS: { kind: "drug" | "lab"; codes: string[]; reason: string }[] = [
  { kind: "drug", codes: ["INJ-NS500", "INJ-NS100", "INJ-VEENF500", "INJ-SOL3A500", "INJ-GLU5-500", "INJ-GLU5-250", "INJ-NSSY10", "INJ-HEPLOCK10"], reason: "補液・溶解・ルート維持等の用途があり特定の病名を求めない" },
  { kind: "drug", codes: ["INJ-APAP1000", "INJ-KCL20", "INJ-VITAMEDIN", "INJ-PTX", "INJ-CBDCA", "INJ-ETP", "INJ-PALO", "INJ-FAPR", "INJ-DEX66", "INJ-FAMO20", "INJ-MOR10", "ORAL-CELE100", "ORAL-TRAM25", "ORAL-FAMO20", "ORAL-CAND8", "ORAL-TRAZ25", "ORAL-PICO25", "ORAL-CARB500", "ORAL-DEXT15", "ORAL-PRED5", "ORAL-MECO500", "ORAL-FOL5", "ORAL-APAP500", "ORAL-DNP5", "ORAL-ENA5", "ORAL-BISO25", "ORAL-SPL25", "ORAL-MGO330", "ORAL-LOX60", "ORAL-REBA100", "ORAL-SENNA12", "ORAL-OXC5"], reason: "個別の効能・予防・併用条件を確認後にルールを追加する（今回は点検対象外）" },
  { kind: "lab", codes: ["LAB-CBC", "LAB-DIFF", "LAB-CHEM", "LAB-CRP", "LAB-COAG", "LAB-UA", "LAB-WBC", "LAB-HB", "LAB-PLT", "LAB-PT", "LAB-APTT", "LAB-TP", "LAB-ALB", "LAB-AST", "LAB-ALT", "LAB-LD", "LAB-ALP", "LAB-GGT", "LAB-TBIL", "LAB-BUN", "LAB-CRE", "LAB-URIC", "LAB-NA", "LAB-CL", "LAB-K", "LAB-CA", "LAB-IP", "LAB-MG", "LAB-GLU", "LAB-TG", "LAB-TCHO", "LAB-HDL", "LAB-LDL", "LAB-RBC", "LAB-HT", "LAB-ESR", "LAB-BGA", "LAB-VBG", "LAB-ABO", "LAB-IRRAB", "LAB-XMATCH", "LAB-MRSASCR"], reason: "一般的な検査・輸血準備・スクリーニングは特定の病名に限定しない（CRPを含む）" },
  { kind: "lab", codes: ["LAB-VCM", "LAB-RET", "LAB-FIB", "LAB-DD", "LAB-FDP", "LAB-DBIL", "LAB-CHE", "LAB-AMY", "LAB-CK", "LAB-FE", "LAB-UIBC", "LAB-FERRITIN", "LAB-NH3", "LAB-LAC", "LAB-PCT", "LAB-TNT", "LAB-UPRO", "LAB-UNA", "LAB-UK", "LAB-UCRE", "LAB-UCX", "LAB-MDIFF", "LAB-PTINR", "LAB-AT3", "LAB-TAT", "LAB-PLG", "LAB-LIP", "LAB-PAMY", "LAB-CYSC", "LAB-B2MG", "LAB-ZN", "LAB-CU", "LAB-OSM", "LAB-PREALB", "LAB-HPT", "LAB-SPEP", "LAB-VB12", "LAB-FOL", "LAB-VB1", "LAB-VD25", "LAB-KL6", "LAB-PSEP", "LAB-BDG", "LAB-HBSAG", "LAB-HBSAB", "LAB-HBCAB", "LAB-HCVAB", "LAB-HIV", "LAB-TPAB", "LAB-RPR", "LAB-HTLV1", "LAB-ASPAG", "LAB-CRAG", "LAB-CMVAG", "LAB-IGRA", "LAB-MYCOAB", "LAB-FLUAG", "LAB-COVAG", "LAB-COVFLUAG", "LAB-PNEUUAG", "LAB-LEGUAG", "LAB-TNI", "LAB-CKMB", "LAB-CORT", "LAB-ACTH", "LAB-ALD", "LAB-PRA", "LAB-PRL", "LAB-GH", "LAB-IGF1", "LAB-ADH", "LAB-LH", "LAB-FSH", "LAB-E2", "LAB-TESTO", "LAB-IRI", "LAB-CPR", "LAB-PTH", "LAB-SIL2R", "LAB-IGG", "LAB-IGA", "LAB-IGM", "LAB-IGE", "LAB-SIGE", "LAB-RF", "LAB-ANA", "LAB-DSDNA", "LAB-MPO", "LAB-PR3", "LAB-ACPA", "LAB-C3", "LAB-C4", "LAB-CH50", "LAB-IGG4", "LAB-UALB", "LAB-UOSM", "LAB-UUN", "LAB-UHCG", "LAB-FOBT", "LAB-SPCX", "LAB-STOOLCX", "LAB-WOUNDCX", "LAB-THROATCX", "LAB-CSFCX", "LAB-FLUIDCX", "LAB-CATHCX", "LAB-AFBCX", "LAB-SMEAR", "LAB-AFBSMEAR", "LAB-TBPCR", "LAB-COVPCR", "LAB-COVFLUPCR", "LAB-CDIFF", "LAB-TEIC", "LAB-DIG", "LAB-VPA", "LAB-CBZ", "LAB-PHT", "LAB-TAC", "LAB-CYA", "LAB-LI", "LAB-THEO", "LAB-MTX", "LAB-DAT"], reason: "個別の算定対象・鑑別・薬物濃度管理等の根拠を確認後に追加する（今回は点検対象外）" },

];

export interface DiseaseCandidate {
  key: string;
  ruleId: string;
  code: string;
  name: string;
  text: string;
  example: string;
  suspected: boolean;
  month: string;
  /** 病名で覆われない日（todayからの相対日）。同一品目は月1候補。 */
  days: number[];
  orderIds: string[];
}
export interface DiseaseCheckInput {
  entries: HistoryEntry[];
  diagnoses: Diagnosis[];
  today: string;
  month: string;
  nowTime?: string;
  admittedOn?: number;
  dischargedOn?: number;
  notGiven?: string[];
}
const dateAt = (today: string, day: number) => new Date(Date.parse(today + "T00:00:00Z") + day * 86400000).toISOString().slice(0, 10);
const normalize = (s: string) => s.normalize("NFKC").replace(/[.\s]/g, "");
export function matchesDisease(d: Diagnosis, match: DiseaseMatch): boolean {
  const code = normalize(d.icd10 ?? "").toUpperCase();
  return !!(match.icd?.some(range => {
    const [lo, hi] = range.split("-");
    return hi ? code.length >= 3 && code.slice(0, 3) >= lo && code.slice(0, 3) <= hi : !!code && code.startsWith(lo);
  }) || match.words?.some(w => normalize(diagnosisLabel(d)).includes(normalize(w))));
}
function active(d: Diagnosis, day: number, input: DiseaseCheckInput, suspected: boolean): boolean {
  return diagnosisClaimable(d, input.month) && d.encounter !== "外来" && d.start <= day &&
    (suspected || (!isSuspected(d) && !/疑い|疑診/.test(diagnosisLabel(d)))) &&
    (d.outcome === "継続" || (d.outcomeDay !== undefined && day <= d.outcomeDay));
}
function expand(codes: string[]): string[] {
  return [...new Set(codes.flatMap(c => findSet(c)?.labCodes ?? [c]))];
}
/** 対象月のオーダ日ではなく採取日/投与日を使う。未来・取消・未実施・中止後を除く。 */
function occurrences(e: OrderEntry, input: DiseaseCheckInput, lo: number, hi: number): { code: string; day: number; kind: "drug" | "lab" }[] {
  const o = e.order;
  const [y, m, d] = input.today.split("-").map(Number);
  const base = { y, m, d };
  const now = minutesOf(input.nowTime ?? "23:59");
  const until = Math.min((hi + 1) * 1440, now + 1);
  if (e.verbal?.cancelled) return [];
  if (o.type === "lab") return e.status !== "中止" && o.collect.day >= lo && o.collect.day <= hi && o.collect.day * 1440 + minutesOf(o.collect.time) < until ? expand(o.codes).map(code => ({ code, day: o.collect.day, kind: "lab" })) : [];
  if (o.type !== "injection" && o.type !== "prescription") return [];
  const from = o.start.day * 1440 + minutesOf(o.type === "injection" ? o.start.time ?? e.time : WARD_RULES.medTimes[o.start.timing ?? o.timings[0]] ?? "00:00");
  const stop = e.status === "中止" ? e.stoppedOn === undefined ? e.day * 1440 + minutesOf(e.time) : e.stoppedTime ? e.stoppedOn * 1440 + minutesOf(e.stoppedTime) : (e.stoppedOn + 1) * 1440 : Infinity;
  let end = Math.min(until, stop, o.days ? o.type === "prescription" && o.dayPattern ? (rxLastDay(o, base)! + 1) * 1440 : from + o.days * 1440 : Infinity);
  if (o.type === "injection" && o.end) end = Math.min(end, o.end.day * 1440 + minutesOf(o.end.time));
  let times: number[] = [];
  if (o.type === "injection") {
    times = o.schedule.kind === "once" ? [from] : doseTimes({ ...e, status: "有効" }, now, lo * 1440, end, base);
  } else if (o.once) times = [o.once.day * 1440 + minutesOf(o.once.time)];
  else if (o.prn) times = (o.prnUses ?? []).map(u => u.day * 1440 + minutesOf(u.time));
  else for (let day = Math.max(lo, o.start.day); day <= hi; day++) if (patternDay(o.dayPattern, o.start.day, day, base)) for (const t of o.timings) times.push(day * 1440 + minutesOf(WARD_RULES.medTimes[t]));
  const codes = o.type === "injection" ? o.items.filter(i => i.amount > 0).map(i => i.drugCode) : o.amount > 0 ? [o.drugCode] : [];
  return [...new Set(times.filter(t => t >= from && t >= lo * 1440 && t < end && !input.notGiven?.includes(`${e.id}|${t}`)).map(t => Math.floor(t / 1440)))].flatMap(day => codes.map(code => ({ code, day, kind: "drug" as const })));
}
export function checkDiseases(input: DiseaseCheckInput): DiseaseCandidate[] {
  const [y, m] = input.month.split("-").map(Number);
  const base = Date.parse(input.today + "T00:00:00Z");
  const lo = Math.max((Date.UTC(y, m - 1, 1) - base) / 86400000, input.admittedOn ?? -Infinity);
  const hi = Math.min((Date.UTC(y, m, 0) - base) / 86400000, 0, input.dischargedOn ?? Infinity);
  if (hi < lo) return [];
  const events = input.entries.flatMap(e => e.kind === "order" ? occurrences(e, input, lo, hi).map(o => ({ ...o, orderId: e.id })) : []);
  const out = new Map<string, DiseaseCandidate>();
  for (const event of events) {
    for (const rule of DISEASE_RULES.filter(r => r.kind === event.kind && r.codes.includes(event.code))) {
      const hasDisease = input.diagnoses.some(d => active(d, event.day, input, rule.suspected) && rule.any.some(match => matchesDisease(d, match)));
      // 再発予防には潰瘍既往＋同じ日のNSAIDs。病名の転帰が治癒でも既往として扱う。
      const prevention = rule.ulcerPrevention && input.diagnoses.some(d => !d.auto && !d.notClaimable && d.outcome !== "移行" && !isSuspected(d) && !/疑い|疑診/.test(diagnosisLabel(d)) && d.start <= event.day && matchesDisease(d, { icd: ["K25-K28"], words: ["胃潰瘍", "十二指腸潰瘍", "吻合部潰瘍"] })) && events.some(e => e.day === event.day && ["ORAL-CELE100", "ORAL-LOX60"].includes(e.code));
      if (hasDisease || prevention) continue;
      const key = `${input.month}:${rule.id}:${event.code}`;
      const current = out.get(key);
      if (current) { if (!current.days.includes(event.day)) current.days.push(event.day); if (!current.orderIds.includes(event.orderId)) current.orderIds.push(event.orderId); continue; }
      const name = event.kind === "lab" ? findLab(event.code)?.abbr ?? event.code : findDrug(event.code)?.name ?? ORAL_DRUGS.find(d => d.code === event.code)?.name ?? event.code;
      const label = event.kind === "drug" ? classOf(event.code)?.yakko || rule.label : rule.label;
      out.set(key, { key, ruleId: rule.id, code: event.code, name, text: `病名漏れの候補：${name}（${label}）に見合う病名がありません（例：${rule.example}）`, example: rule.example, suspected: rule.suspected, month: input.month, days: [event.day], orderIds: [event.orderId] });
    }
  }
  return [...out.values()].map(c => ({ ...c, days: c.days.sort((a, b) => a - b) }));
}
export const diseaseCandidateDate = (input: Pick<DiseaseCheckInput, "today">, day: number) => dateAt(input.today, day);

export function diseaseMasterCoverage() {
  return [
    ...DRUGS.map(d => ({ kind: "drug" as const, code: d.code })),
    ...ORAL_DRUGS.map(d => ({ kind: "drug" as const, code: d.code })),
    ...LAB_TESTS.map(d => ({ kind: "lab" as const, code: d.code })),
  ].map(item => ({ ...item, rules: DISEASE_RULES.filter(r => r.kind === item.kind && r.codes.includes(item.code)), exclusion: DISEASE_CHECK_EXCLUSIONS.find(e => e.kind === item.kind && e.codes.includes(item.code))?.reason }));
}
