// 規制区分 and the other classes the pharmacy keeps for every drug of the (fictional) hospital master, as read
// in the current 電子添文 on PMDA (医療用医薬品 情報検索, read 2026-11-04): 規制区分 (麻薬・毒薬・劇薬・
// 向精神薬・処方箋医薬品・生物由来製品) and 薬効分類名・日本標準商品分類番号・一般的名称 from the header of
// each 電子添文, for the product and strength of the master item. Code only looks the class up and shows
// it; how a drug is handled is decided by people (and by the law quoted below).
//
// The marks follow the law's own marks: 毒薬 黒地に白枠・白字「毒」, 劇薬 白地に赤枠・赤字「劇」
// (医薬品医療機器等法 第44条), 麻薬は丸で囲んだ「麻」(麻薬及び向精神薬取締法 第31条), 向精神薬は丸で囲んだ「向」(同 第50条の19).
//
// 「ハイリスク」 here is the group of 薬剤管理指導料「1」(特に安全管理が必要な医薬品: 抗悪性腫瘍剤・免疫抑制剤・
// 不整脈用剤・抗てんかん剤・血液凝固阻止剤（内服薬に限る。）・ジギタリス製剤・テオフィリン製剤・カリウム製剤
// （注射薬に限る。）・精神神経用剤・糖尿病用剤・膵臓ホルモン剤・抗ＨＩＶ薬), from the 留意事項通知 B008 (2).
// Which master item falls in which group was set by hand from its 電子添文 (薬効分類名・有効成分); the
// ministry's own list of the target drugs (named in the same notice) was not read, so this is the fictional
// hospital pharmacy's reading and the pharmacist confirms it.

import { INTERACTION_SOURCES, PMDA_DETAIL, type SourceKey } from "./interactions";
import { DRUGS, ORAL_DRUGS } from "./master";

export type Kisei = "麻薬" | "向精神薬" | "毒薬" | "劇薬" | "処方箋医薬品" | "生物由来製品";

/** 薬剤管理指導料「1」の対象の薬剤の分類 (the notice's words). */
export type B008Group =
  | "抗悪性腫瘍剤"
  | "免疫抑制剤"
  | "不整脈用剤"
  | "抗てんかん剤"
  | "血液凝固阻止剤（内服薬に限る。）"
  | "ジギタリス製剤"
  | "テオフィリン製剤"
  | "カリウム製剤（注射薬に限る。）"
  | "精神神経用剤"
  | "糖尿病用剤"
  | "膵臓ホルモン剤"
  | "抗ＨＩＶ薬";

export const DRUG_CLASS_SOURCES = {
  law: { label: "医薬品医療機器等法 第44条（毒薬は黒地に白枠・白字で「毒」、劇薬は白地に赤枠・赤字で「劇」）・第48条（他の物と区別して貯蔵、毒薬はかぎを施す）", url: "https://laws.e-gov.go.jp/law/335AC0000000145" },
  narcoticLaw: { label: "麻薬及び向精神薬取締法 第31条（麻薬の容器に丸で囲んだ「麻」の記号）・第50条の19（向精神薬の容器に丸で囲んだ「向」の記号）・第34条（麻薬は鍵をかけた堅固な設備内に保管）", url: "https://laws.e-gov.go.jp/law/328AC0000000014" },
  b008: {
    label: "診療報酬の算定方法の一部改正に伴う実施上の留意事項について（令和8年3月5日 保医発0305第6号）別添1 B008 薬剤管理指導料 (2)「1」の対象（特に安全管理が必要な医薬品）・(6)(8) 麻薬管理指導加算",
    url: "https://www.mhlw.go.jp/content/12400000/001757385.pdf",
  },
  pmda: { label: "PMDA 医療用医薬品 情報検索（各薬の電子添文。2026-11-04 に読んだ版）", url: "https://www.pmda.go.jp/PmdaSearch/iyakuSearch/" },
};

/** 電子添文 read for the items added to the master with this module (not in the interaction table). */
export const EXTRA_SOURCES = {
  morphineInj: { product: "モルヒネ塩酸塩注射液10mg「シオノギ」・50mg「シオノギ」", maker: "シオノギファーマ（販売：塩野義製薬）", revision: "2024年11月改訂（第3版）", docId: "343018_8114401A1112_2_06", codes: ["INJ-MOR10"] },
  oxycontinTR: { product: "オキシコンチンTR錠5mg・10mg・20mg・40mg", maker: "シオノギファーマ（販売：塩野義製薬）", revision: "2026年3月改訂（第4版）", docId: "343018_8119002G5020_2_09", codes: ["ORAL-OXC5"] },
  salineSyringe: { product: "生食注シリンジ「オーツカ」5mL・10mL・20mL", maker: "大塚製薬工場", revision: "2025年9月改訂（第2版）", docId: "180079_3311402G7050_1_08", codes: ["INJ-NSSY10"] },
} as const;

export type DocKey = SourceKey | keyof typeof EXTRA_SOURCES;

export function docOf(k: DocKey): { product: string; maker: string; revision: string; docId: string } {
  return (EXTRA_SOURCES as Record<string, { product: string; maker: string; revision: string; docId: string }>)[k] ?? INTERACTION_SOURCES[k as SourceKey];
}

export const docUrl = (k: DocKey) => `${PMDA_DETAIL}${docOf(k).docId}`;

export interface DrugClass {
  /** 規制区分 printed in the 電子添文 for this product and strength (empty = none printed). */
  kisei: Kisei[];
  /** 薬効分類名 (empty when the 電子添文 prints none). */
  yakko: string;
  /** 日本標準商品分類番号. */
  bunrui: string;
  /** 一般的名称 as printed (empty when the 電子添文 prints none). */
  generic: string;
  /** The product (販売名 and strength) of the 電子添文 that the master item is. */
  product: string;
  doc: DocKey;
  /** 薬剤管理指導料「1」の対象: the group and what in the 電子添文 puts it there. */
  b008?: { group: B008Group; why: string };
}

const 処方 = "処方箋医薬品" as const;

export const DRUG_CLASSES: Record<string, DrugClass> = {
  // --- 注射 ---
  "INJ-NS500": { kisei: [処方], yakko: "生理食塩液", bunrui: "873311", generic: "日本薬局方 生理食塩液", product: "大塚生食注 500mLソフトバッグ", doc: "otsukaSaline" },
  "INJ-NS100": { kisei: [処方], yakko: "生理食塩液", bunrui: "873311", generic: "日本薬局方 生理食塩液", product: "大塚生食注 100mLプラボトル", doc: "otsukaSaline" },
  "INJ-VEENF500": { kisei: [処方], yakko: "酢酸リンゲル液", bunrui: "873319", generic: "", product: "ヴィーンF輸液", doc: "veenF" },
  "INJ-SOL3A500": { kisei: [処方], yakko: "", bunrui: "873319", generic: "ブドウ糖－電解質液（維持液）", product: "ソルデム3A輸液（500mL）", doc: "soldem3A" },
  "INJ-GLU5-500": { kisei: [処方], yakko: "", bunrui: "873231", generic: "ブドウ糖注射液", product: "大塚糖液5%（500mL袋）", doc: "otsukaGlucose" },
  "INJ-GLU5-250": { kisei: [処方], yakko: "", bunrui: "873231", generic: "ブドウ糖注射液", product: "大塚糖液5%（250mL袋）", doc: "otsukaGlucose" },
  "INJ-VCM05": { kisei: [処方], yakko: "グリコペプチド系抗生物質製剤", bunrui: "876113", generic: "バンコマイシン塩酸塩", product: "塩酸バンコマイシン点滴静注用0.5g", doc: "vcm" },
  "INJ-CEZ1": { kisei: [処方], yakko: "合成セファロスポリン製剤", bunrui: "876132", generic: "注射用セファゾリンナトリウム水和物", product: "セファメジンα注射用1g", doc: "cefamezin" },
  "INJ-SBTABPC3": { kisei: [処方], yakko: "β-ラクタマーゼ阻害剤配合抗生物質製剤", bunrui: "876139", generic: "アンピシリンナトリウム・スルバクタムナトリウム", product: "スルバシリン静注用3g", doc: "sulbacillin" },
  "INJ-CTRX1": { kisei: [処方], yakko: "セフェム系抗生物質製剤", bunrui: "876132", generic: "セフトリアキソンナトリウム水和物", product: "ロセフィン静注用1g", doc: "rocephin" },
  "INJ-FRS20": { kisei: [処方], yakko: "利尿降圧剤", bunrui: "872139", generic: "フロセミド注射液", product: "ラシックス注20mg", doc: "lasixInj" },
  "INJ-APAP1000": { kisei: ["劇薬", 処方], yakko: "解熱鎮痛剤", bunrui: "871141", generic: "アセトアミノフェン", product: "アセリオ静注液1000mgバッグ", doc: "acelio" },
  "INJ-KCL20": {
    kisei: [処方],
    yakko: "補正用電解質液",
    bunrui: "873319",
    generic: "補正用1モル塩化カリウム液",
    product: "KCL注20mEqキット「テルモ」",
    doc: "kclTerumo",
    b008: { group: "カリウム製剤（注射薬に限る。）", why: "有効成分 塩化カリウムの注射薬" },
  },
  "INJ-VITAMEDIN": { kisei: [処方], yakko: "複合ビタミンB製剤", bunrui: "873179", generic: "リン酸チアミンジスルフィド・ピリドキシン塩酸塩・シアノコバラミン", product: "ビタメジン静注用", doc: "vitamedin" },
  "INJ-NSSY10": { kisei: [処方], yakko: "生理食塩液", bunrui: "873311", generic: "日本薬局方 生理食塩液", product: "生食注シリンジ「オーツカ」10mL", doc: "salineSyringe" },
  "INJ-HEPLOCK10": { kisei: [処方, "生物由来製品"], yakko: "血液凝固阻止剤 ヘパリンロック液", bunrui: "873334", generic: "ヘパリンナトリウム", product: "ヘパリンNaロック用10単位/mLシリンジ「オーツカ」10mL", doc: "heparinLock" },
  "INJ-PTX": { kisei: ["毒薬", 処方], yakko: "抗悪性腫瘍剤", bunrui: "87424", generic: "パクリタキセル", product: "タキソール注射液100mg", doc: "taxol", b008: { group: "抗悪性腫瘍剤", why: "薬効分類名「抗悪性腫瘍剤」" } },
  "INJ-CBDCA": { kisei: ["毒薬", 処方], yakko: "抗悪性腫瘍剤", bunrui: "874291", generic: "カルボプラチン", product: "パラプラチン注射液450mg", doc: "paraplatin", b008: { group: "抗悪性腫瘍剤", why: "薬効分類名「抗悪性腫瘍剤」" } },
  "INJ-ETP": { kisei: ["劇薬", 処方], yakko: "抗悪性腫瘍剤", bunrui: "87424", generic: "エトポシド注射液", product: "ラステット注100mg/5mL", doc: "lastet", b008: { group: "抗悪性腫瘍剤", why: "薬効分類名「抗悪性腫瘍剤」" } },
  "INJ-PALO": { kisei: ["劇薬", 処方], yakko: "5-HT3受容体拮抗型制吐剤", bunrui: "872391", generic: "パロノセトロン塩酸塩", product: "アロキシ静注0.75mg", doc: "aloxi" },
  "INJ-FAPR": { kisei: [処方], yakko: "選択的NK1受容体拮抗型制吐剤", bunrui: "872391", generic: "注射用ホスアプレピタントメグルミン", product: "プロイメンド点滴静注用150mg", doc: "proemend" },
  "INJ-DEX66": { kisei: [処方], yakko: "副腎皮質ホルモン製剤", bunrui: "872454", generic: "デキサメタゾンリン酸エステルナトリウム", product: "デキサート注射液6.6mg", doc: "dexart" },
  "INJ-FAMO20": { kisei: [処方], yakko: "H2受容体拮抗剤", bunrui: "872325", generic: "ファモチジン", product: "ガスター注射液20mg", doc: "gasterInj" },
  "INJ-MOR10": { kisei: ["劇薬", "麻薬", 処方], yakko: "モルヒネ系製剤", bunrui: "878114", generic: "モルヒネ塩酸塩水和物", product: "モルヒネ塩酸塩注射液10mg「シオノギ」", doc: "morphineInj" },
  // --- 内服 ---
  "ORAL-AMLO5": { kisei: ["劇薬", 処方], yakko: "高血圧症・狭心症治療薬 持続性Ca拮抗薬", bunrui: "872171", generic: "アムロジピンベシル酸塩", product: "ノルバスク錠5mg", doc: "norvasc" },
  "ORAL-LPZ15": { kisei: [], yakko: "プロトンポンプインヒビター", bunrui: "872329", generic: "ランソプラゾール腸溶性口腔内崩壊錠", product: "タケプロンOD錠15", doc: "takepronOD" },
  "ORAL-APAP500": { kisei: ["劇薬"], yakko: "解熱鎮痛剤", bunrui: "871141", generic: "アセトアミノフェン錠", product: "カロナール錠500", doc: "calonal" },
  "ORAL-DNP5": { kisei: ["劇薬", 処方], yakko: "アルツハイマー型、レビー小体型認知症治療剤", bunrui: "87119", generic: "ドネペジル塩酸塩", product: "アリセプトD錠5mg", doc: "ariceptD" },
  "ORAL-ENA5": { kisei: [処方], yakko: "持続性アンジオテンシン変換酵素阻害剤", bunrui: "872144", generic: "エナラプリルマレイン酸塩", product: "レニベース錠5", doc: "renivace" },
  "ORAL-BISO25": { kisei: [処方], yakko: "選択的β1アンタゴニスト", bunrui: "872123", generic: "ビソプロロールフマル酸塩錠", product: "メインテート錠2.5mg", doc: "maintate" },
  "ORAL-SPL25": { kisei: [処方], yakko: "抗アルドステロン性利尿・降圧剤", bunrui: "872133", generic: "スピロノラクトン", product: "アルダクトンA錠25mg", doc: "aldactoneA" },
  "ORAL-ROSU25": { kisei: [処方], yakko: "HMG-CoA還元酵素阻害剤", bunrui: "872189", generic: "日本薬局方 ロスバスタチンカルシウム錠", product: "クレストール錠2.5mg", doc: "crestor" },
  "ORAL-MGO330": { kisei: [], yakko: "制酸・緩下剤", bunrui: "872344", generic: "酸化マグネシウム製剤", product: "マグミット錠330mg", doc: "magmitt" },
  "ORAL-FRS20": { kisei: [処方], yakko: "利尿降圧剤", bunrui: "872139", generic: "フロセミド錠", product: "ラシックス錠20mg", doc: "lasixTab" },
  "ORAL-LOX60": { kisei: [], yakko: "鎮痛・抗炎症・解熱剤", bunrui: "871149", generic: "ロキソプロフェンナトリウム水和物錠", product: "ロキソニン錠60mg", doc: "loxonin" },
  "ORAL-REBA100": { kisei: [], yakko: "胃炎・胃潰瘍治療剤", bunrui: "872329", generic: "レバミピド錠", product: "ムコスタ錠100mg", doc: "mucosta" },
  "ORAL-SENNA12": { kisei: [], yakko: "緩下剤", bunrui: "872354", generic: "センノシドA・B", product: "プルゼニド錠12mg", doc: "pursennid" },
  "ORAL-MET250": {
    kisei: ["劇薬", 処方],
    yakko: "ビグアナイド系経口血糖降下剤",
    bunrui: "873962",
    generic: "メトホルミン塩酸塩",
    product: "メトグルコ錠250mg",
    doc: "metglco",
    b008: { group: "糖尿病用剤", why: "薬効分類名「ビグアナイド系経口血糖降下剤」（日本標準商品分類 3962）" },
  },
  "ORAL-OXC5": { kisei: ["劇薬", "麻薬", 処方], yakko: "持続性疼痛治療剤", bunrui: "878119", generic: "オキシコドン塩酸塩水和物", product: "オキシコンチンTR錠5mg", doc: "oxycontinTR" },
};

export const classOf = (code: string): DrugClass | undefined => DRUG_CLASSES[code];

export const isNarcotic = (code: string): boolean => !!DRUG_CLASSES[code]?.kisei.includes("麻薬");

/** Every 麻薬 of the master (麻薬及び向精神薬取締法 の麻薬, from the 電子添文). */
export const NARCOTICS: ReadonlySet<string> = new Set(Object.keys(DRUG_CLASSES).filter(isNarcotic));

export type MarkKey = "麻" | "向" | "毒" | "劇" | "ハイリスク";

export interface Mark {
  key: MarkKey;
  /** What the mark means, in full. */
  title: string;
}

/** The marks shown next to a drug, strongest first. 処方箋医薬品・生物由来製品 are not marked (most drugs here are 処方箋医薬品). */
export function marksOf(code: string): Mark[] {
  const c = DRUG_CLASSES[code];
  if (!c) return [];
  const out: Mark[] = [];
  if (c.kisei.includes("麻薬")) out.push({ key: "麻", title: "麻薬（麻薬及び向精神薬取締法）：麻薬施用者が処方し、施用・残液・返納を記録する" });
  if (c.kisei.includes("向精神薬")) out.push({ key: "向", title: "向精神薬（麻薬及び向精神薬取締法）" });
  if (c.kisei.includes("毒薬")) out.push({ key: "毒", title: "毒薬（医薬品医療機器等法 第44条）：かぎのかかる場所に区別して保管" });
  if (c.kisei.includes("劇薬")) out.push({ key: "劇", title: "劇薬（医薬品医療機器等法 第44条）：他の物と区別して保管" });
  if (c.b008) out.push({ key: "ハイリスク", title: `ハイリスク薬（薬剤管理指導料「1」の対象：${c.b008.group}）` });
  return out;
}

/** Drug codes of an order (injection items, the oral drug), for the marks. */
export function drugCodesOf(o: { type: string; items?: { drugCode: string }[]; drugCode?: string } | undefined | null): string[] {
  if (!o) return [];
  if (o.type === "injection") return (o.items ?? []).map((i) => i.drugCode);
  if (o.type === "prescription" && o.drugCode) return [o.drugCode];
  return [];
}

/** Master items with no class entry (should be none; a test keeps it so). */
export function unclassified(): string[] {
  return [...DRUGS.map((d) => d.code), ...ORAL_DRUGS.map((d) => d.code)].filter((c) => !DRUG_CLASSES[c]);
}
