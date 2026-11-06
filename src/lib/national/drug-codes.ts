import { EAR_DROP } from "../prescription-kind";
// The codes of the oral drugs of the fictional hospital's master, as the official 医薬品マスター
// (社会保険診療報酬支払基金・厚生労働省 基本マスター y_20261013.csv) gives them: レセプト電算処理システム用
// コード (9桁), 薬価基準収載医薬品コード (12桁) and, where the master has one, 一般名処方マスタのコードと一般名.
// A test checks every row against the downloaded master (src/data/generated/y.json).
// The other institutions' drugs (OTHER_DRUGS) are drugs of the same master used in the FICTIONAL records of
// other hospitals and pharmacies (薬剤情報・他院の処方).

import { ADOPTED_TOPICAL, ADOPTED_INJECTIONS, ADOPTED_ORAL, ADOPTED_GENERIC_CODES } from "../formulary-items";

import { DRUG_CODES } from "../billing/codes";

export interface DrugCodes {
  /** レセプト電算処理システム用コード（医薬品, 9桁）. */
  receipt: string;
  /** 薬価基準収載医薬品コード（12桁）. */
  yakka: string;
  /** 医薬品マスターの基本漢字名称. */
  name: string;
  /** 一般名処方マスタ: コードと一般名（ない品目もある）. */
  generic?: { code: string; name: string };
  /** 単位（医薬品マスターの単位名称）. */
  unit: string;
}

export const DRUG_MASTER_SOURCE = { name: "医薬品マスター（基本マスター）", file: "y_20261013.csv", url: "https://shinryohoshu.mhlw.go.jp/shinryohoshu/downloadMenu/yFile" };

/** Our oral drugs (master.ts codes) → the official codes. */
export const ORAL_DRUG_CODES: Record<string, DrugCodes> = {
  ...Object.fromEntries(ADOPTED_ORAL.map((r) => [r[0], { receipt: r[0], yakka: r[4], name: r[1], unit: r[2], ...(ADOPTED_GENERIC_CODES[r[0]] ? { generic: ADOPTED_GENERIC_CODES[r[0]] } : {}) }])),
  "ORAL-AMPC250": {"receipt": "616130132", "yakka": "6131001F2026", "name": "サワシリン錠２５０　２５０ｍｇ", "unit": "錠"},
  "ORAL-AMCL250": {"receipt": "621116301", "yakka": "6139100F2044", "name": "オーグメンチン配合錠２５０ＲＳ　（３７５ｍｇ）", "unit": "錠"},
  "ORAL-LVFX500": {"receipt": "621925801", "yakka": "6241013F3027", "name": "クラビット錠５００ｍｇ　（レボフロキサシンとして）", "unit": "錠", "generic": {"code": "6241013F3ZZZ", "name": "【般】レボフロキサシン錠５００ｍｇ"}},
  "ORAL-CFPN100": {"receipt": "610411058", "yakka": "6132016F2020", "name": "フロモックス錠１００ｍｇ", "unit": "錠"},
  "ORAL-AZM250": {"receipt": "610443026", "yakka": "6149004F1028", "name": "ジスロマック錠２５０ｍｇ", "unit": "錠", "generic": {"code": "6149004F1ZZZ", "name": "【般】アジスロマイシン錠２５０ｍｇ"}},
  "ORAL-ST": {"receipt": "621148901", "yakka": "6290100F2115", "name": "バクタ配合錠", "unit": "錠"},
  "ORAL-CELE100": {"receipt": "620004857", "yakka": "1149037F1020", "name": "セレコックス錠１００ｍｇ", "unit": "錠", "generic": {"code": "1149037F1ZZZ", "name": "【般】セレコキシブ錠１００ｍｇ"}},
  "ORAL-TRAM25": {"receipt": "622366101", "yakka": "1149038F1024", "name": "トラマールＯＤ錠２５ｍｇ", "unit": "錠", "generic": {"code": "1149038F1ZZZ", "name": "【般】トラマドール塩酸塩口腔内崩壊錠２５ｍｇ"}},
  "ORAL-ESOM20": {"receipt": "622080801", "yakka": "2329029M2023", "name": "ネキシウムカプセル２０ｍｇ", "unit": "カプセル", "generic": {"code": "2329029M2ZZZ", "name": "【般】エソメプラゾールカプセル２０ｍｇ"}},
  "ORAL-FAMO20": {"receipt": "612320350", "yakka": "2325003F2020", "name": "ガスター錠２０ｍｇ", "unit": "錠"},
  "ORAL-CAND8": {"receipt": "610432013", "yakka": "2149040F3029", "name": "ブロプレス錠８　８ｍｇ", "unit": "錠", "generic": {"code": "2149040F3ZZZ", "name": "【般】カンデサルタン錠８ｍｇ"}},
  "ORAL-SITA50": {"receipt": "621951001", "yakka": "3969010F2030", "name": "ジャヌビア錠５０ｍｇ", "unit": "錠"},
  "ORAL-ATOR10": {"receipt": "610443014", "yakka": "2189015F2020", "name": "リピトール錠１０ｍｇ", "unit": "錠", "generic": {"code": "2189015F2ZZZ", "name": "【般】アトルバスタチン錠１０ｍｇ"}},
  "ORAL-ZOL5": {"receipt": "610443047", "yakka": "1129009F1025", "name": "マイスリー錠５ｍｇ", "unit": "錠", "generic": {"code": "1129009F1ZZZ", "name": "【般】ゾルピデム酒石酸塩錠５ｍｇ"}},
  "ORAL-SUV15": {"receipt": "622374201", "yakka": "1190023F1024", "name": "ベルソムラ錠１５ｍｇ", "unit": "錠"},
  "ORAL-TRAZ25": {"receipt": "611170826", "yakka": "1179037F1029", "name": "レスリン錠２５　２５ｍｇ", "unit": "錠"},
  "ORAL-PICO25": {"receipt": "620488701", "yakka": "2359005F1218", "name": "ラキソベロン錠２．５ｍｇ", "unit": "錠"},
  "ORAL-CARB500": {"receipt": "610407447", "yakka": "2233002F2022", "name": "ムコダイン錠５００ｍｇ", "unit": "錠"},
  "ORAL-DEXT15": {"receipt": "612220325", "yakka": "2223001F2099", "name": "メジコン錠１５ｍｇ", "unit": "錠", "generic": {"code": "2223001F2ZZZ", "name": "【般】デキストロメトルファン臭化水素酸塩錠１５ｍｇ"}},
  "ORAL-WAR1": {"receipt": "613330003", "yakka": "3332001F1024", "name": "ワーファリン錠１ｍｇ", "unit": "錠"},
  "ORAL-API25": {"receipt": "622224901", "yakka": "3339004F1029", "name": "エリキュース錠２．５ｍｇ", "unit": "錠"},
  "ORAL-EDO30": {"receipt": "622576101", "yakka": "3339002F5025", "name": "リクシアナＯＤ錠３０ｍｇ", "unit": "錠"},
  "ORAL-PRED5": {"receipt": "612450118", "yakka": "2456001F1019", "name": "プレドニン錠５ｍｇ", "unit": "錠"},
  "ORAL-MECO500": {"receipt": "613130595", "yakka": "3136004F2138", "name": "メチコバール錠５００μｇ　０．５ｍｇ", "unit": "錠", "generic": {"code": "3136004F2ZZZ", "name": "【般】メコバラミン錠０．５ｍｇ"}},
  "ORAL-FOL5": {"receipt": "613130585", "yakka": "3135001F1017", "name": "フォリアミン錠　５ｍｇ", "unit": "錠"},
  "ORAL-AMLO5": { receipt: "620007860", yakka: "2171022F2017", name: "アムロジピン錠５ｍｇ「ＮＳ」", unit: "錠" },
  // 麻薬 (the pharmacy's 2 narcotics): from the same 医薬品マスター row (y_20261013).
  "ORAL-OXC5": { receipt: "622576301", yakka: "8119002G5020", name: "オキシコンチンＴＲ錠５ｍｇ", unit: "錠" },
  "ORAL-LPZ15": { receipt: "620009451", yakka: "2329023F1012", name: "ランソプラゾールＯＤ錠１５ｍｇ「トーワ」", generic: { code: "2329023F1ZZZ", name: "【般】ランソプラゾール口腔内崩壊錠１５ｍｇ" }, unit: "錠" },
  "ORAL-APAP500": { receipt: "622381201", yakka: "1141007F3023", name: "カロナール錠５００　５００ｍｇ", generic: { code: "1141007F3ZZZ", name: "【般】アセトアミノフェン錠５００ｍｇ" }, unit: "錠" },
  "ORAL-DNP5": { receipt: "622092001", yakka: "1190012F4017", name: "ドネペジル塩酸塩ＯＤ錠５ｍｇ「アメル」", generic: { code: "1190012F4ZZZ", name: "【般】ドネペジル塩酸塩口腔内崩壊錠５ｍｇ" }, unit: "錠" },
  "ORAL-ENA5": { receipt: "621244404", yakka: "2144002F2012", name: "エナラプリルマレイン酸塩錠５ｍｇ「ＶＴＲＳ」", unit: "錠" },
  "ORAL-BISO25": { receipt: "621399401", yakka: "2123016F1018", name: "ビソプロロールフマル酸塩錠２．５ｍｇ「トーワ」", generic: { code: "2123016F1ZZZ", name: "【般】ビソプロロールフマル酸塩錠２．５ｍｇ" }, unit: "錠" },
  "ORAL-SPL25": { receipt: "620003560", yakka: "2133001F1018", name: "スピロノラクトン錠２５ｍｇ「トーワ」", generic: { code: "2133001F1ZZZ", name: "【般】スピロノラクトン錠２５ｍｇ" }, unit: "錠" },
  "ORAL-ROSU25": { receipt: "622582001", yakka: "2189017F1014", name: "ロスバスタチン錠２．５ｍｇ「トーワ」", generic: { code: "2189017F1ZZZ", name: "【般】ロスバスタチン錠２．５ｍｇ" }, unit: "錠" },
  "ORAL-MGO330": { receipt: "620005434", yakka: "2344009F2015", name: "酸化マグネシウム錠３３０ｍｇ「モチダ」", generic: { code: "2344009F2ZZZ", name: "【般】酸化マグネシウム錠３３０ｍｇ" }, unit: "錠" },
  "ORAL-FRS20": { receipt: "620004042", yakka: "2139005F1010", name: "フロセミド錠２０ｍｇ「ＮＰ」", generic: { code: "2139005F1ZZZ", name: "【般】フロセミド錠２０ｍｇ" }, unit: "錠" },
  "ORAL-LOX60": { receipt: "620098902", yakka: "1149019F1013", name: "ロキソプロフェンＮａ錠６０ｍｇ「ＹＤ」", generic: { code: "1149019F1ZZZ", name: "【般】ロキソプロフェンＮａ錠６０ｍｇ" }, unit: "錠" },
  "ORAL-REBA100": { receipt: "620009460", yakka: "2329021F1013", name: "レバミピド錠１００ｍｇ「あすか」", unit: "錠" },
  "ORAL-SENNA12": { receipt: "620480205", yakka: "2354003F2014", name: "センノシド錠１２ｍｇ「セイコー」", generic: { code: "2354003F2ZZZ", name: "【般】センノシド錠１２ｍｇ" }, unit: "錠" },
  "ORAL-MET250": { receipt: "621676001", yakka: "3962002F1110", name: "メトホルミン塩酸塩錠２５０ｍｇ「ＳＮ」", generic: { code: "3962002F1ZZZ", name: "【般】メトホルミン塩酸塩錠２５０ｍｇ：ＧＬ" }, unit: "錠" },
};

/** Drugs that appear only in the FICTIONAL records of other institutions (codes from the same master). */
export const OTHER_DRUGS: Record<string, DrugCodes & { ingredient: string }> = {
  "OTHER-EPL25": { receipt: "620005824", yakka: "2149045F1029", name: "セララ錠２５ｍｇ", generic: { code: "2149045F1ZZZ", name: "【般】エプレレノン錠２５ｍｇ" }, unit: "錠", ingredient: "エプレレノン" },
};

/** Every code of this file, for the test against the downloaded master. */
export const ALL_DRUG_CODES: DrugCodes[] = [...Object.values(ORAL_DRUG_CODES), ...Object.values(OTHER_DRUGS)];

/** The receipt code the billing already uses for an oral drug must be the same as here. */
export const billingReceiptCode = (code: string): string | undefined => DRUG_CODES[code];

/** 外用・自己注射の製品コード。一般名への置換は行わない。 */
export const PRESCRIPTION_DRUG_CODES: Record<string, DrugCodes> = {
  [EAR_DROP.code]: { receipt: EAR_DROP.code, yakka: EAR_DROP.yakka, name: EAR_DROP.name, unit: EAR_DROP.unit },
  ...ORAL_DRUG_CODES,
  ...Object.fromEntries([...ADOPTED_TOPICAL, ...ADOPTED_INJECTIONS].map(r => [r[0], { receipt: r[0], yakka: r[4], name: r[1], unit: r[2] }])),
};
