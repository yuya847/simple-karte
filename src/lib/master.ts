// Master data for a FICTIONAL hospital ("架空の病院").
// Drug names and package sizes are public facts; the selection, aliases, set contents
// and ward rules below are made up for this prototype and are not any real hospital's.

import type { InjectionRoute } from "./types";
import { MORE_LAB_INFO, MORE_LAB_TESTS } from "./lab-master-more";

export interface DrugMaster {
  /** Demo-only item: no official code, price or electronic package insert. */
  fictional?: boolean;
  code: string;
  name: string;
  /** 一般名・分類は商品名と分けて補足と検索に使う。 */
  generic?: string;
  category?: string;
  /** Package description shown on screen, e.g. "500mL/袋". */
  package: string;
  kind: "輸液" | "抗菌薬" | "その他";
  /** For fluids: volume of one bag/bottle in mL. */
  volumeMl?: number;
  /** For vials/ampoules: strength of one unit. */
  strength?: { amount: number; unit: "g" | "mg" | "mEq"; per: "V" | "A" | "袋" | "キット" };
  /** Units a doctor may use for this drug. Anything else is a unit error. */
  units: string[];
  routes: InjectionRoute[];
  /** Words doctors say for this drug (brand names, abbreviations). */
  aliases: string[];
  /** A flush to keep a line open (ロック): 生食・ヘパリンのシリンジ. */
  lock?: boolean;
  /** 抗がん薬: ordered only from the regimen panel (架空の病院の取り決め), where the dose is calculated. */
  chemo?: boolean;
}

export const DRUGS: DrugMaster[] = [
  ...[ ["HUMAN", "ヒト（速効型）注 100単位/mL"], ["ASPART", "アスパルト注"], ["LISPRO", "リスプロ注"], ["GLARGINE", "グラルギン注"], ["DEGLUDEC", "デグルデク注"] ].map(([code, name]): DrugMaster => ({ fictional: true, code: `DEMO-INS-${code}`, name: `インスリン ${name}`, generic: `インスリン ${name}`, category: "インスリン", package: "架空の品目（薬価なし）", kind: "その他", units: ["単位"], routes: ["皮下注"], aliases: ["インスリン", name] })),
  {
    code: "INJ-NS500",
    name: "大塚生食注 500mLソフトバッグ",
    generic: "生理食塩液",
    package: "500mL/袋",
    kind: "輸液",
    volumeMl: 500,
    units: ["mL", "本", "袋"],
    routes: ["点滴静注"],
    aliases: ["生食", "生理食塩水", "NS", "生食500", "セイショク", "セイリショクエンスイ"],
  },
  {
    code: "INJ-NS100",
    name: "大塚生食注 100mLプラボトル",
    generic: "生理食塩液",
    package: "100mL/袋",
    kind: "輸液",
    volumeMl: 100,
    units: ["mL", "本", "袋"],
    routes: ["点滴静注"],
    aliases: ["生食100", "生食 100", "セイショク100"],
  },
  {
    code: "INJ-VEENF500",
    name: "ヴィーンF輸液 500mL",
    generic: "酢酸リンゲル液",
    package: "500mL/袋",
    kind: "輸液",
    volumeMl: 500,
    units: ["mL", "本", "袋"],
    routes: ["点滴静注"],
    aliases: ["ヴィーンF", "ヴィーン", "ビーンF", "酢酸リンゲル"],
  },
  {
    code: "INJ-SOL3A500",
    name: "ソルデム3A輸液 500mL",
    generic: "ブドウ糖－電解質液",
    category: "維持液",
    package: "500mL/袋",
    kind: "輸液",
    volumeMl: 500,
    units: ["mL", "本", "袋"],
    routes: ["点滴静注"],
    aliases: ["ソルデム3A", "ソルデム", "3A", "維持液", "イジエキ"],
  },
  {
    code: "INJ-GLU5-500",
    name: "大塚糖液5%（500mL袋）",
    generic: "5%ブドウ糖液",
    package: "500mL/袋",
    kind: "輸液",
    volumeMl: 500,
    units: ["mL", "本", "袋"],
    routes: ["点滴静注"],
    aliases: ["5%ブドウ糖", "5%TZ", "5%糖", "ブドウトウ"],
  },
  {
    code: "INJ-VCM05",
    name: "塩酸バンコマイシン点滴静注用0.5g",
    generic: "バンコマイシン塩酸塩点滴静注用",
    package: "0.5g/V",
    kind: "抗菌薬",
    strength: { amount: 0.5, unit: "g", per: "V" },
    units: ["g", "mg", "V"],
    routes: ["点滴静注"],
    aliases: ["VCM", "バンコ", "バンコマイシン"],
  },
  {
    code: "INJ-CEZ1",
    name: "セファメジンα注射用1g",
    generic: "セファゾリンナトリウム注射用",
    package: "1g/V",
    kind: "抗菌薬",
    strength: { amount: 1, unit: "g", per: "V" },
    units: ["g", "mg", "V"],
    routes: ["点滴静注", "静注"],
    aliases: ["CEZ", "セファゾリン", "セファメジン"],
  },
  {
    code: "INJ-SBTABPC3",
    name: "スルバシリン静注用3g",
    generic: "スルバクタム・アンピシリン静注用",
    package: "3g/V",
    kind: "抗菌薬",
    strength: { amount: 3, unit: "g", per: "V" },
    units: ["g", "mg", "V"],
    routes: ["点滴静注", "静注"],
    aliases: ["ABPC/SBT", "SBT/ABPC", "ユナシン", "スルバシリン"],
  },
  {
    code: "INJ-CTRX1",
    name: "ロセフィン静注用1g",
    generic: "セフトリアキソンナトリウム静注用",
    package: "1g/V",
    kind: "抗菌薬",
    strength: { amount: 1, unit: "g", per: "V" },
    units: ["g", "mg", "V"],
    routes: ["点滴静注", "静注"],
    aliases: ["CTRX", "セフトリアキソン", "ロセフィン"],
  },
  {
    code: "INJ-FRS20",
    name: "ラシックス注20mg",
    generic: "フロセミド注",
    package: "20mg/2mL/A",
    kind: "その他",
    strength: { amount: 20, unit: "mg", per: "A" },
    units: ["mg", "A", "mL"],
    routes: ["静注", "筋注"],
    aliases: ["ラシックス", "フロセミド"],
  },
  {
    code: "INJ-APAP1000",
    name: "アセリオ静注液1000mgバッグ",
    generic: "アセトアミノフェン静注液",
    package: "1000mg/100mL/袋",
    kind: "その他",
    strength: { amount: 1000, unit: "mg", per: "袋" },
    units: ["mg", "mL", "袋", "本"],
    routes: ["点滴静注"],
    aliases: ["アセリオ", "アセトアミノフェン"],
  },
  {
    code: "INJ-KCL20",
    name: "KCL注20mEqキット",
    package: "20mEq/20mL/キット",
    kind: "その他",
    strength: { amount: 20, unit: "mEq", per: "キット" },
    units: ["mEq", "mL", "キット"],
    // Never given as it is: always mixed into a fluid and dripped (checked in code).
    routes: ["点滴静注"],
    aliases: ["KCL", "KCl", "塩化カリウム", "カリウム", "エンカカリウム"],
  },
  {
    code: "INJ-VITAMEDIN",
    name: "ビタメジン静注用",
    package: "1V（瓶）",
    kind: "その他",
    units: ["V"],
    routes: ["点滴静注", "静注"],
    aliases: ["ビタメジン", "ビタミンB1・B6・B12"],
  },
  {
    code: "INJ-NSSY10",
    name: "生食注シリンジ「オーツカ」10mL",
    generic: "生食注シリンジ",
    package: "10mL/筒",
    kind: "その他",
    volumeMl: 10,
    units: ["本", "mL"],
    routes: ["静注"],
    aliases: ["生食シリンジ", "生食ロック", "生食フラッシュ", "セイショクシリンジ"],
    lock: true,
  },
  {
    code: "INJ-HEPLOCK10",
    name: "ヘパリンNaロック用10単位/mLシリンジ「オーツカ」10mL",
    generic: "ヘパリンNaロック用シリンジ",
    package: "10単位/mL・10mL/筒",
    kind: "その他",
    volumeMl: 10,
    units: ["本", "mL"],
    routes: ["静注"],
    aliases: ["ヘパロック", "ヘパリンロック"],
    lock: true,
  },
  // 抗がん薬と前投薬（院内登録レジメンで使う。量はレジメンの欄でコードが計算する）
  {
    code: "INJ-PTX",
    name: "タキソール注射液100mg",
    generic: "パクリタキセル注射液",
    package: "100mg/16.7mL/V",
    kind: "その他",
    strength: { amount: 100, unit: "mg", per: "V" },
    units: ["mg"],
    routes: ["点滴静注"],
    aliases: ["PTX", "パクリタキセル", "タキソール", "パクリ"],
    chemo: true,
  },
  {
    code: "INJ-CBDCA",
    name: "パラプラチン注射液450mg",
    generic: "カルボプラチン点滴静注液",
    package: "450mg/45mL/V",
    kind: "その他",
    strength: { amount: 450, unit: "mg", per: "V" },
    units: ["mg"],
    routes: ["点滴静注"],
    aliases: ["CBDCA", "カルボプラチン", "パラプラチン", "カルボ"],
    chemo: true,
  },
  {
    code: "INJ-ETP",
    name: "ラステット注100mg/5mL",
    generic: "エトポシド点滴静注液",
    package: "100mg/5mL/V",
    kind: "その他",
    strength: { amount: 100, unit: "mg", per: "V" },
    units: ["mg"],
    routes: ["点滴静注"],
    aliases: ["ETP", "VP-16", "VP16", "エトポシド", "ラステット", "ベプシド"],
    chemo: true,
  },
  {
    code: "INJ-PALO",
    name: "アロキシ静注0.75mg",
    generic: "パロノセトロン静注",
    package: "0.75mg/5mL/V",
    kind: "その他",
    strength: { amount: 0.75, unit: "mg", per: "V" },
    units: ["mg", "V"],
    routes: ["静注", "点滴静注"],
    aliases: ["パロノセトロン", "アロキシ", "パロノ"],
  },
  {
    code: "INJ-FAPR",
    name: "プロイメンド点滴静注用150mg",
    generic: "ホスアプレピタント点滴静注用",
    package: "150mg/V",
    kind: "その他",
    strength: { amount: 150, unit: "mg", per: "V" },
    units: ["mg", "V"],
    routes: ["点滴静注"],
    aliases: ["ホスアプレピタント", "プロイメンド", "fAPR"],
  },
  {
    code: "INJ-DEX66",
    name: "デキサート注射液6.6mg",
    generic: "デキサメタゾン注射液（デキサート）",
    package: "6.6mg/2mL/V",
    kind: "その他",
    strength: { amount: 6.6, unit: "mg", per: "V" },
    units: ["mg", "mL", "V"],
    routes: ["静注", "点滴静注"],
    aliases: ["デキサメタゾン", "デキサート", "DEX", "デカドロン"],
  },
  {
    code: "INJ-FAMO20",
    name: "ガスター注射液20mg",
    generic: "ファモチジン静注",
    package: "20mg/20mL/A",
    kind: "その他",
    strength: { amount: 20, unit: "mg", per: "A" },
    units: ["mg", "A"],
    routes: ["静注"],
    aliases: ["ファモチジン", "ガスター", "ガスター注"],
  },
  {
    code: "INJ-GLU5-250",
    name: "大塚糖液5%（250mL袋）",
    generic: "5%ブドウ糖液",
    package: "250mL/袋",
    kind: "輸液",
    volumeMl: 250,
    units: ["mL", "本", "袋"],
    routes: ["点滴静注"],
    aliases: ["5%ブドウ糖250", "5%TZ250", "5%糖250"],
  },
  // 麻薬（麻薬及び向精神薬取締法）: モルヒネ塩酸塩注射液10mg「シオノギ」の電子添文（1管1mL中10mg、1回5〜10mgを皮下に注射。
  // 麻酔の補助で静脈内にも）。麻薬施用者の免許のある医師だけが確定できる（narcotics.ts）。
  {
    code: "INJ-MOR10",
    name: "モルヒネ塩酸塩注射液10mg「シオノギ」",
    generic: "モルヒネ塩酸塩注射液",
    package: "10mg/1mL/A",
    kind: "その他",
    strength: { amount: 10, unit: "mg", per: "A" },
    units: ["mg", "A", "mL"],
    routes: ["皮下注", "静注"],
    aliases: ["モルヒネ", "モルヒネ注", "塩モヒ", "塩酸モルヒネ", "モヒ"],
  },
];

/**
 * KCl injection limits, from the package insert of KCL注20mEqキット「テルモ」（用法・用量に関連する注意）:
 * dilute to 40 mEq/L or less, no faster than 20 mEq per hour, no more than 100 mEq a day.
 */
export const KCL_LIMITS = { maxMeqPerL: 40, maxMeqPerHour: 20, maxMeqPerDay: 100, source: "KCL注20mEqキット「テルモ」添付文書 7.1〜7.3（2023年4月改訂 第1版）" };

/** Oral drugs of the fictional hospital (public names and strengths). */
export interface OralDrugMaster {
  code: string;
  name: string;
  strength: string;
  unit: "錠" | "カプセル" | "包";
  aliases: string[];
  /** Strength of one unit in mg (for the daily-amount check). */
  mg?: number;
  /** Classes an allergy or a duplicate check looks at (e.g. "NSAIDs"). */
  classes?: string[];
  /** Upper limit of the daily amount in mg, from the package insert (adults). Checked in code; the doctor may confirm it with a comment. */
  maxDailyMg?: { mg: number; source: string };
  /** A tablet with a score line: halves are allowed. */
  scored?: boolean;
}

export const ORAL_MASTER_SOURCE = { label: "内服薬の規格・規制区分：PMDA電子添文（追加25品目は2026-11-05確認）", url: "https://www.pmda.go.jp/PmdaSearch/iyakuSearch/" };

export const ORAL_DRUGS: OralDrugMaster[] = [
  {"code": "ORAL-AMPC250", "name": "アモキシシリン水和物錠", "strength": "250mg", "unit": "錠", "aliases": ["サワシリン", "アモキシシリン水和物", "アモキシシリン", "さわしりん", "あもきししりん水和物", "あもきししりん"], "classes": ["ペニシリン系抗菌薬"]},
  {"code": "ORAL-AMCL250", "name": "アモキシシリン・クラブラン酸配合錠", "strength": "アモキシシリン250mg・クラブラン酸125mg", "unit": "錠", "aliases": ["オーグメンチン", "アモキシシリン・クラブラン酸配合", "アモキシシリン・クラブラン酸", "おーぐめんちん", "あもきししりん・くらぶらん酸配合", "あもきししりん・くらぶらん酸"], "classes": ["ペニシリン系抗菌薬"]},
  {"code": "ORAL-LVFX500", "name": "レボフロキサシン錠", "strength": "500mg", "unit": "錠", "aliases": ["クラビット", "レボフロキサシン", "くらびっと", "れぼふろきさしん"], "classes": ["キノロン系抗菌薬"]},
  {"code": "ORAL-CFPN100", "name": "セフカペンピボキシル塩酸塩錠", "strength": "100mg", "unit": "錠", "aliases": ["フロモックス", "セフカペンピボキシル塩酸塩", "セフカペン", "ふろもっくす", "せふかぺんぴぼきしる塩酸塩", "せふかぺん"], "classes": ["セフェム系抗菌薬"]},
  {"code": "ORAL-AZM250", "name": "アジスロマイシン錠", "strength": "250mg", "unit": "錠", "aliases": ["ジスロマック", "アジスロマイシン", "じすろまっく", "あじすろまいしん"], "classes": ["マクロライド系抗菌薬"]},
  {"code": "ORAL-ST", "name": "スルファメトキサゾール・トリメトプリム配合錠", "strength": "400mg・80mg", "unit": "錠", "aliases": ["バクタ", "スルファメトキサゾール・トリメトプリム配合", "ST合剤", "エスティー合剤", "ばくた", "するふぁめときさぞーる・とりめとぷりむ配合", "えすてぃー合剤"], "classes": ["ST合剤"]},
  {"code": "ORAL-CELE100", "name": "セレコキシブ錠", "strength": "100mg", "unit": "錠", "aliases": ["セレコックス", "セレコキシブ", "せれこっくす", "せれこきしぶ"], "classes": ["NSAIDs"]},
  {"code": "ORAL-TRAM25", "name": "トラマドール塩酸塩OD錠", "strength": "25mg", "unit": "錠", "aliases": ["トラマール", "トラマドール塩酸塩", "トラマドール", "とらまーる", "とらまどーる塩酸塩", "とらまどーる"], "classes": ["オピオイド"]},
  {"code": "ORAL-ESOM20", "name": "エソメプラゾールカプセル", "strength": "20mg", "unit": "カプセル", "aliases": ["ネキシウム", "エソメプラゾール", "ねきしうむ", "えそめぷらぞーる"], "classes": ["プロトンポンプ阻害薬"]},
  {"code": "ORAL-FAMO20", "name": "ファモチジン錠", "strength": "20mg", "unit": "錠", "aliases": ["ガスター", "ファモチジン", "がすたー", "ふぁもちじん"], "classes": ["H2受容体拮抗薬"]},
  {"code": "ORAL-CAND8", "name": "カンデサルタンシレキセチル錠", "strength": "8mg", "unit": "錠", "aliases": ["ブロプレス", "カンデサルタンシレキセチル", "カンデサルタン", "ぶろぷれす", "かんでさるたんしれきせちる", "かんでさるたん"], "classes": ["ARB"]},
  {"code": "ORAL-SITA50", "name": "シタグリプチンリン酸塩錠", "strength": "50mg", "unit": "錠", "aliases": ["ジャヌビア", "シタグリプチンリン酸塩", "シタグリプチン", "じゃぬびあ", "したぐりぷちんりん酸塩", "したぐりぷちん"], "classes": ["DPP-4阻害薬"]},
  {"code": "ORAL-ATOR10", "name": "アトルバスタチン錠", "strength": "10mg", "unit": "錠", "aliases": ["リピトール", "アトルバスタチン", "りぴとーる", "あとるばすたちん"], "classes": ["スタチン"]},
  {"code": "ORAL-ZOL5", "name": "ゾルピデム酒石酸塩錠", "strength": "5mg", "unit": "錠", "aliases": ["マイスリー", "ゾルピデム酒石酸塩", "ゾルピデム", "まいすりー", "ぞるぴでむ酒石酸塩", "ぞるぴでむ"], "classes": ["睡眠薬"]},
  {"code": "ORAL-SUV15", "name": "スボレキサント錠", "strength": "15mg", "unit": "錠", "aliases": ["ベルソムラ", "スボレキサント", "べるそむら", "すぼれきさんと"], "classes": ["睡眠薬"]},
  {"code": "ORAL-TRAZ25", "name": "トラゾドン塩酸塩錠", "strength": "25mg", "unit": "錠", "aliases": ["レスリン", "トラゾドン塩酸塩", "トラゾドン", "れすりん", "とらぞどん"], "classes": ["抗うつ薬"]},
  {"code": "ORAL-PICO25", "name": "ピコスルファートナトリウム錠", "strength": "2.5mg", "unit": "錠", "aliases": ["ラキソベロン", "ピコスルファートナトリウム", "ピコスルファート", "らきそべろん", "ぴこするふぁーとなとりうむ", "ぴこするふぁーと"], "classes": ["緩下薬"]},
  {"code": "ORAL-CARB500", "name": "カルボシステイン錠", "strength": "500mg", "unit": "錠", "aliases": ["ムコダイン", "カルボシステイン", "むこだいん", "かるぼしすていん"], "classes": ["去痰薬"]},
  {"code": "ORAL-DEXT15", "name": "デキストロメトルファン錠", "strength": "15mg", "unit": "錠", "aliases": ["メジコン", "デキストロメトルファン", "めじこん", "できすとろめとるふぁん"], "classes": ["鎮咳薬"]},
  {"code": "ORAL-WAR1", "name": "ワルファリンカリウム錠", "strength": "1mg", "unit": "錠", "aliases": ["ワーファリン", "ワルファリンカリウム", "ワルファリン", "わーふぁりん", "わるふぁりんかりうむ", "わるふぁりん"], "classes": ["抗凝固薬"]},
  {"code": "ORAL-API25", "name": "アピキサバン錠", "strength": "2.5mg", "unit": "錠", "aliases": ["エリキュース", "アピキサバン", "えりきゅーす", "あぴきさばん"], "classes": ["抗凝固薬"]},
  {"code": "ORAL-EDO30", "name": "エドキサバンOD錠", "strength": "30mg", "unit": "錠", "aliases": ["リクシアナ", "エドキサバン", "りくしあな", "えどきさばん"], "classes": ["抗凝固薬"]},
  {"code": "ORAL-PRED5", "name": "プレドニゾロン錠", "strength": "5mg", "unit": "錠", "aliases": ["プレドニン", "プレドニゾロン", "ぷれどにん", "ぷれどにぞろん"], "classes": ["副腎皮質ホルモン"]},
  {"code": "ORAL-MECO500", "name": "メコバラミン錠", "strength": "500μg", "unit": "錠", "aliases": ["メチコバール", "メコバラミン", "めちこばーる", "めこばらみん"], "classes": ["ビタミンB12"]},
  {"code": "ORAL-FOL5", "name": "葉酸錠", "strength": "5mg", "unit": "錠", "aliases": ["フォリアミン", "葉酸", "ふぉりあみん"], "classes": ["葉酸製剤"]},
  { code: "ORAL-AMLO5", name: "アムロジピン錠", strength: "5mg", unit: "錠", aliases: ["アムロジピン", "ノルバスク", "アムロジン"], mg: 5, classes: ["カルシウム拮抗薬"], maxDailyMg: { mg: 10, source: "添付文書（高血圧症：1日最大10mg）" }, scored: true },
  { code: "ORAL-LPZ15", name: "ランソプラゾールOD錠", strength: "15mg", unit: "錠", aliases: ["ランソプラゾール", "タケプロン"] },
  { code: "ORAL-APAP500", name: "アセトアミノフェン錠", strength: "500mg", unit: "錠", aliases: ["カロナール", "アセトアミノフェン"], mg: 500, classes: ["解熱鎮痛薬"], maxDailyMg: { mg: 4000, source: "添付文書（成人の鎮痛：1日総量4,000mgを限度）" }, scored: true },
  { code: "ORAL-DNP5", name: "ドネペジル塩酸塩OD錠", strength: "5mg", unit: "錠", aliases: ["ドネペジル", "アリセプト"] },
  { code: "ORAL-ENA5", name: "エナラプリルマレイン酸塩錠", strength: "5mg", unit: "錠", aliases: ["エナラプリル", "レニベース"] },
  { code: "ORAL-BISO25", name: "ビソプロロールフマル酸塩錠", strength: "2.5mg", unit: "錠", aliases: ["ビソプロロール", "メインテート"] },
  { code: "ORAL-SPL25", name: "スピロノラクトン錠", strength: "25mg", unit: "錠", aliases: ["スピロノラクトン", "アルダクトン"] },
  { code: "ORAL-ROSU25", name: "ロスバスタチン錠", strength: "2.5mg", unit: "錠", aliases: ["ロスバスタチン", "クレストール"] },
  { code: "ORAL-MGO330", name: "酸化マグネシウム錠", strength: "330mg", unit: "錠", aliases: ["酸化マグネシウム", "マグミット", "カマ", "サンカマグネシウム"] },
  { code: "ORAL-FRS20", name: "フロセミド錠", strength: "20mg", unit: "錠", aliases: ["フロセミド", "ラシックス"] },
  { code: "ORAL-LOX60", name: "ロキソプロフェンNa錠", strength: "60mg", unit: "錠", aliases: ["ロキソプロフェン", "ロキソニン", "ロキソ"], mg: 60, classes: ["NSAIDs", "解熱鎮痛薬"], maxDailyMg: { mg: 180, source: "添付文書（1日最大180mg）" } },
  { code: "ORAL-REBA100", name: "レバミピド錠", strength: "100mg", unit: "錠", aliases: ["レバミピド", "ムコスタ"] },
  { code: "ORAL-SENNA12", name: "センノシド錠", strength: "12mg", unit: "錠", aliases: ["センノシド", "プルゼニド"] },
  { code: "ORAL-MET250", name: "メトホルミン塩酸塩錠", strength: "250mg", unit: "錠", aliases: ["メトホルミン", "メトグルコ"], mg: 250, classes: ["ビグアナイド系"] },
  // 麻薬: オキシコンチンTR錠5mg の電子添文（1日量を2回に分けて12時間ごと。割ったり砕いたりしない：8.1）。
  { code: "ORAL-OXC5", name: "オキシコドン塩酸塩徐放錠", strength: "5mg", unit: "錠", aliases: ["オキシコンチン", "オキシコンチンTR", "オキシコドン徐放", "オキシコドン"], mg: 5, classes: ["オピオイド"] },
];

/** The active ingredient of an oral drug of the master (its name without the dosage form). */
export function ingredientOf(code: string): string | null {
  const d = ORAL_DRUGS.find((x) => x.code === code);
  return d ? d.name.replace(/(OD)?錠$|カプセル$|散$/, "") : null;
}

export function findOralDrug(code: string): OralDrugMaster | undefined {
  return ORAL_DRUGS.find((d) => d.code === code);
}

/** Name of an injection or oral drug, for messages. */
export function anyDrugName(code: string): string {
  const inj = DRUGS.find((d) => d.code === code);
  if (inj) return inj.name;
  return ORAL_DRUGS.find((d) => d.code === code)?.name ?? code;
}

export type LabGroup =
  | "血液学"
  | "凝固・線溶"
  | "生化学"
  | "炎症・感染"
  | "心筋・心不全"
  | "内分泌"
  | "腫瘍マーカー"
  | "免疫・アレルギー"
  | "血液ガス"
  | "尿"
  | "便"
  | "微生物"
  | "微生物（塗抹・遺伝子）"
  | "薬物濃度"
  | "輸血検査"
  | "セット";

export interface LabMaster {
  code: string;
  name: string;
  /** Short name shown on the order buttons (WBC, Na, Mg …). */
  abbr?: string;
  group?: LabGroup;
  specimen: "血液" | "尿" | "その他";
  /** For sets: analyte codes the set contains. */
  contains?: string[];
  aliases: string[];
  /** Words that must be asked when missing, e.g. number of culture sets. */
  needs?: "sets";
  /** Kept for old records and the AI's aliases, not offered on the order screen. */
  hidden?: true;
}

export const LAB_TESTS: LabMaster[] = [
  {
    code: "LAB-CBC",
    group: "血液学",
    abbr: "血算",
    name: "血算（CBC）",
    specimen: "血液",
    contains: ["WBC", "RBC", "Hb", "Ht", "Plt"],
    aliases: ["CBC", "血算", "末梢血"],
  },
  {
    code: "LAB-DIFF",
    group: "血液学",
    abbr: "白血球分画",
    name: "白血球分画",
    specimen: "血液",
    contains: ["Neut", "Lymph"],
    aliases: ["分画", "白血球分画", "像"],
  },
  {
    code: "LAB-CHEM",
    group: "セット",
    abbr: "生化学セット",
    name: "生化学（病棟定期セット）",
    specimen: "血液",
    contains: ["TP", "Alb", "AST", "ALT", "LDH", "ALP", "T-Bil", "BUN", "Cre", "Na", "K", "Cl", "Glu"],
    aliases: ["生化", "生化一式", "生化学", "バイオ"],
  },
  {
    code: "LAB-CRP",
    group: "炎症・感染",
    abbr: "CRP",
    name: "CRP",
    specimen: "血液",
    contains: ["CRP"],
    aliases: ["CRP"],
  },
  {
    // Old pair code (凝固): kept so earlier records and the AI's "凝固" still resolve; the screen offers PT and APTT one by one.
    code: "LAB-COAG",
    group: "凝固・線溶",
    abbr: "PT・APTT",
    name: "凝固（PT・APTT）",
    specimen: "血液",
    contains: ["PT-INR", "APTT"],
    aliases: ["凝固", "PT", "APTT"],
    hidden: true,
  },
  {
    code: "LAB-BNP",
    group: "心筋・心不全",
    abbr: "BNP",
    name: "BNP",
    specimen: "血液",
    contains: ["BNP"],
    aliases: ["BNP"],
  },
  {
    code: "LAB-VCM",
    group: "薬物濃度",
    abbr: "VCM",
    name: "バンコマイシン血中濃度",
    specimen: "血液",
    contains: ["VCM"],
    aliases: ["VCM濃度", "バンコ濃度", "VCMトラフ", "TDM", "バンコマイシン濃度"],
  },
  {
    code: "LAB-BCX",
    group: "微生物",
    abbr: "血液培養",
    name: "血液培養",
    specimen: "血液",
    aliases: ["血培", "血液培養"],
    needs: "sets",
  },
  {
    code: "LAB-UA",
    group: "尿",
    abbr: "尿一般",
    name: "尿一般（定性・沈渣）",
    specimen: "尿",
    aliases: ["検尿", "尿一般", "尿定性", "沈渣"],
  },
  { code: "LAB-WBC", name: "白血球数（末梢血液一般として算定）", abbr: "WBC", group: "血液学", specimen: "血液", contains: ["WBC"], aliases: ["WBC", "白血球", "白血球数"] },
  { code: "LAB-HB", name: "ヘモグロビン（末梢血液一般として算定）", abbr: "Hb", group: "血液学", specimen: "血液", contains: ["Hb"], aliases: ["Hb", "ヘモグロビン", "ヘモグロ"] },
  { code: "LAB-PLT", name: "血小板数（末梢血液一般として算定）", abbr: "Plt", group: "血液学", specimen: "血液", contains: ["Plt"], aliases: ["Plt", "血小板"] },
  { code: "LAB-RET", name: "網赤血球数", abbr: "Ret", group: "血液学", specimen: "血液", contains: ["Ret"], aliases: ["網赤血球", "レチクロ", "Ret"] },
  { code: "LAB-PT", name: "PT（プロトロンビン時間。外因系の凝固の検査。秒・活性・INR を報告）", abbr: "PT", group: "凝固・線溶", specimen: "血液", contains: ["PT-INR"], aliases: ["PT-INR", "INR", "プロトロンビン"] },
  { code: "LAB-APTT", name: "APTT（活性化部分トロンボプラスチン時間。内因系の凝固の検査。ヘパリンの調節にも使う）", abbr: "APTT", group: "凝固・線溶", specimen: "血液", contains: ["APTT"], aliases: ["APTT"] },
  { code: "LAB-FIB", name: "フィブリノゲン（凝固の材料になる蛋白）", abbr: "フィブリノゲン", group: "凝固・線溶", specimen: "血液", contains: ["Fib"], aliases: ["フィブリノゲン", "Fib", "フィブリノーゲン"] },
  { code: "LAB-DD", name: "Dダイマー（できた血栓が溶けたときに出る分解産物）", abbr: "Dダイマー", group: "凝固・線溶", specimen: "血液", contains: ["DD"], aliases: ["Dダイマー", "D-ダイマー", "Dダイ"] },
  { code: "LAB-FDP", name: "FDP（フィブリン・フィブリノゲン分解産物、定量）", abbr: "FDP", group: "凝固・線溶", specimen: "血液", contains: ["FDP"], aliases: ["FDP"] },
  { code: "LAB-TP", name: "総蛋白", abbr: "TP", group: "生化学", specimen: "血液", contains: ["TP"], aliases: ["TP", "総蛋白"] },
  { code: "LAB-ALB", name: "アルブミン", abbr: "Alb", group: "生化学", specimen: "血液", contains: ["Alb"], aliases: ["Alb", "アルブミン"] },
  { code: "LAB-AST", name: "AST", abbr: "AST", group: "生化学", specimen: "血液", contains: ["AST"], aliases: ["AST", "GOT"] },
  { code: "LAB-ALT", name: "ALT", abbr: "ALT", group: "生化学", specimen: "血液", contains: ["ALT"], aliases: ["ALT", "GPT"] },
  { code: "LAB-LD", name: "LD（乳酸脱水素酵素）", abbr: "LD", group: "生化学", specimen: "血液", contains: ["LDH"], aliases: ["LD", "LDH"] },
  { code: "LAB-ALP", name: "ALP（IFCC）", abbr: "ALP", group: "生化学", specimen: "血液", contains: ["ALP"], aliases: ["ALP"] },
  { code: "LAB-GGT", name: "γ-GT", abbr: "γ-GT", group: "生化学", specimen: "血液", contains: ["GGT"], aliases: ["γGT", "γ-GT", "ガンマGT", "GGT", "γGTP"] },
  { code: "LAB-TBIL", name: "総ビリルビン", abbr: "T-Bil", group: "生化学", specimen: "血液", contains: ["T-Bil"], aliases: ["T-Bil", "総ビリルビン", "TB"] },
  { code: "LAB-DBIL", name: "直接ビリルビン", abbr: "D-Bil", group: "生化学", specimen: "血液", contains: ["D-Bil"], aliases: ["D-Bil", "直接ビリルビン", "DB"] },
  { code: "LAB-CHE", name: "コリンエステラーゼ", abbr: "ChE", group: "生化学", specimen: "血液", contains: ["ChE"], aliases: ["ChE", "コリンエステラーゼ"] },
  { code: "LAB-AMY", name: "アミラーゼ", abbr: "AMY", group: "生化学", specimen: "血液", contains: ["AMY"], aliases: ["AMY", "アミラーゼ"] },
  { code: "LAB-CK", name: "CK", abbr: "CK", group: "生化学", specimen: "血液", contains: ["CK"], aliases: ["CK", "CPK"] },
  { code: "LAB-BUN", name: "尿素窒素", abbr: "BUN", group: "生化学", specimen: "血液", contains: ["BUN"], aliases: ["BUN", "尿素窒素", "UN"] },
  { code: "LAB-CRE", name: "クレアチニン", abbr: "Cre", group: "生化学", specimen: "血液", contains: ["Cre"], aliases: ["Cre", "クレアチニン", "Cr"] },
  { code: "LAB-URIC", name: "尿酸", abbr: "UA", group: "生化学", specimen: "血液", contains: ["UA"], aliases: ["尿酸", "UA（尿酸）"] },
  { code: "LAB-NA", name: "ナトリウム", abbr: "Na", group: "生化学", specimen: "血液", contains: ["Na"], aliases: ["Na", "ナトリウム"] },
  { code: "LAB-CL", name: "クロール", abbr: "Cl", group: "生化学", specimen: "血液", contains: ["Cl"], aliases: ["Cl", "クロール"] },
  { code: "LAB-K", name: "カリウム", abbr: "K", group: "生化学", specimen: "血液", contains: ["K"], aliases: ["K", "カリウム"] },
  { code: "LAB-CA", name: "カルシウム", abbr: "Ca", group: "生化学", specimen: "血液", contains: ["Ca"], aliases: ["Ca", "カルシウム"] },
  { code: "LAB-IP", name: "無機リン", abbr: "IP", group: "生化学", specimen: "血液", contains: ["IP"], aliases: ["IP", "P", "リン", "無機リン"] },
  { code: "LAB-MG", name: "マグネシウム", abbr: "Mg", group: "生化学", specimen: "血液", contains: ["Mg"], aliases: ["Mg", "マグネシウム"] },
  { code: "LAB-GLU", name: "グルコース（血糖）", abbr: "Glu", group: "生化学", specimen: "血液", contains: ["Glu"], aliases: ["血糖", "Glu", "BS", "グルコース"] },
  { code: "LAB-HBA1C", name: "HbA1c（ヘモグロビンA1c、NGSP）", abbr: "HbA1c", group: "内分泌", specimen: "血液", contains: ["HbA1c"], aliases: ["HbA1c", "A1c", "ヘモグロビンA1c"] },
  { code: "LAB-TG", name: "中性脂肪", abbr: "TG", group: "生化学", specimen: "血液", contains: ["TG"], aliases: ["TG", "中性脂肪", "トリグリセリド"] },
  { code: "LAB-TCHO", name: "総コレステロール", abbr: "T-Cho", group: "生化学", specimen: "血液", contains: ["TC"], aliases: ["T-Cho", "総コレステロール", "TC"] },
  { code: "LAB-HDL", name: "HDL-コレステロール", abbr: "HDL-C", group: "生化学", specimen: "血液", contains: ["HDL"], aliases: ["HDL", "HDL-C"] },
  { code: "LAB-LDL", name: "LDL-コレステロール", abbr: "LDL-C", group: "生化学", specimen: "血液", contains: ["LDL"], aliases: ["LDL", "LDL-C"] },
  { code: "LAB-FE", name: "血清鉄", abbr: "Fe", group: "生化学", specimen: "血液", contains: ["Fe"], aliases: ["Fe", "血清鉄", "鉄"] },
  { code: "LAB-UIBC", name: "不飽和鉄結合能", abbr: "UIBC", group: "生化学", specimen: "血液", contains: ["UIBC"], aliases: ["UIBC"] },
  { code: "LAB-FERRITIN", name: "フェリチン", abbr: "フェリチン", group: "生化学", specimen: "血液", contains: ["Ferritin"], aliases: ["フェリチン"] },
  { code: "LAB-NH3", name: "アンモニア", abbr: "NH3", group: "生化学", specimen: "血液", contains: ["NH3"], aliases: ["NH3", "アンモニア"] },
  { code: "LAB-LAC", name: "乳酸", abbr: "乳酸", group: "生化学", specimen: "血液", contains: ["Lac"], aliases: ["乳酸", "ラクテート", "Lac"] },
  { code: "LAB-PCT", name: "プロカルシトニン（定量）", abbr: "PCT", group: "炎症・感染", specimen: "血液", contains: ["PCT"], aliases: ["PCT", "プロカルシトニン"] },
  { code: "LAB-NTBNP", name: "NT-proBNP", abbr: "NT-proBNP", group: "心筋・心不全", specimen: "血液", contains: ["NTproBNP"], aliases: ["NT-proBNP", "NTproBNP"] },
  { code: "LAB-TNT", name: "心筋トロポニンT", abbr: "TnT", group: "心筋・心不全", specimen: "血液", contains: ["TnT"], aliases: ["トロポニン", "トロポニンT", "TnT"] },
  { code: "LAB-TSH", name: "TSH", abbr: "TSH", group: "内分泌", specimen: "血液", contains: ["TSH"], aliases: ["TSH", "甲状腺刺激ホルモン"] },
  { code: "LAB-FT4", name: "FT4", abbr: "FT4", group: "内分泌", specimen: "血液", contains: ["FT4"], aliases: ["FT4", "遊離T4"] },
  { code: "LAB-BGA", name: "動脈血ガス分析（pH・PaCO2・PaO2・HCO3）", abbr: "動脈血ガス", group: "血液ガス", specimen: "血液", contains: ["pH", "PaCO2", "PaO2", "HCO3"], aliases: ["血ガス", "血液ガス", "BGA", "ABG", "動脈血ガス"] },
  { code: "LAB-UPRO", name: "尿蛋白（定量）", abbr: "尿蛋白", group: "尿", specimen: "尿", contains: ["UPro"], aliases: ["尿蛋白", "尿タンパク"] },
  { code: "LAB-UNA", name: "尿中ナトリウム・クロール", abbr: "尿Na", group: "尿", specimen: "尿", contains: ["UNa"], aliases: ["尿中Na", "尿Na", "尿中ナトリウム"] },
  { code: "LAB-UK", name: "尿中カリウム", abbr: "尿K", group: "尿", specimen: "尿", contains: ["UK"], aliases: ["尿中K", "尿K"] },
  { code: "LAB-UCRE", name: "尿中クレアチニン", abbr: "尿Cre", group: "尿", specimen: "尿", contains: ["UCre"], aliases: ["尿中Cre", "尿Cre", "尿中クレアチニン"] },
  {
    code: "LAB-UCX",
    group: "微生物",
    abbr: "尿培養",
    name: "尿培養",
    specimen: "尿",
    aliases: ["尿培", "尿培養"],
  },
  // The rest of the order screen's items (血算〜輸血検査), in the same shape: lab-master-more.ts.
  ...MORE_LAB_TESTS,
];

/** A set approved by the (fictional) hospital. The AI may call it, never edit it. */
export interface OrderSet {
  code: string;
  name: string;
  labCodes: string[];
  aliases: string[];
}

export const ORDER_SETS: OrderSet[] = [
  {
    code: "SET-ADMIT",
    name: "入院時採血セット",
    labCodes: ["LAB-CBC", "LAB-DIFF", "LAB-CHEM", "LAB-CRP", "LAB-COAG"],
    aliases: ["入院時セット", "入院時採血", "いつもの入院時"],
  },
  {
    code: "SET-ROUTINE",
    name: "定期採血セット",
    labCodes: ["LAB-CBC", "LAB-CHEM", "LAB-CRP"],
    aliases: ["定期採血", "いつもの採血", "定期セット"],
  },
  {
    code: "SET-LYTES",
    name: "電解質（Na・K・Cl）",
    labCodes: ["LAB-NA", "LAB-K", "LAB-CL"],
    aliases: ["電解質", "エレクトロライト", "Na・K・Cl", "ナトカリクロール"],
  },
];

/**
 * Analytes shown in the lab result table, with reference ranges and where they come from.
 * - 共用基準範囲: JCCLS「日本における主要な臨床検査項目の共用基準範囲」2022/10/01 版（表1-1）.
 * - SRL: SRL「総合検査案内 2026-2027（セントラルラボラトリー版）」for items without a 共用基準範囲.
 * A clinical decision value / cut-off (判断値) is kept apart from a reference range.
 * Units follow the 共用基準範囲 (WBC as /μL, Plt as 万/μL for display).
 */
export interface Analyte {
  code: string;
  name: string;
  unit: string;
  low?: number;
  high?: number;
  /** Sex-specific range, when the source gives one. */
  m?: { low?: number; high?: number };
  f?: { low?: number; high?: number };
  source?: "共用基準範囲" | "SRL";
  /** A decision value or cut-off, shown apart from the reference range. */
  judgment?: string;
}

export const ANALYTES: Analyte[] = [
  { code: "WBC", name: "WBC", unit: "/μL", low: 3300, high: 8600, source: "共用基準範囲" },
  { code: "Neut", name: "好中球", unit: "%", low: 41.2, high: 75.4, source: "SRL" },
  { code: "Hb", name: "Hb", unit: "g/dL", m: { low: 13.7, high: 16.8 }, f: { low: 11.6, high: 14.8 }, source: "共用基準範囲" },
  { code: "Plt", name: "Plt", unit: "万/μL", low: 15.8, high: 34.8, source: "共用基準範囲" },
  { code: "Ret", name: "網赤血球", unit: "‰", m: { low: 2, high: 27 }, f: { low: 2, high: 26 }, source: "SRL" },
  { code: "PT-INR", name: "PT-INR", unit: "", source: "SRL", judgment: "SRL の案内に INR の基準値の記載なし（PT 秒 10.5〜13.5）" },
  { code: "APTT", name: "APTT", unit: "秒", low: 24.3, high: 36.0, source: "SRL" },
  { code: "Fib", name: "フィブリノゲン", unit: "mg/dL", low: 150, high: 400, source: "SRL" },
  { code: "DD", name: "Dダイマー", unit: "μg/mL", high: 1.0, source: "SRL" },
  { code: "FDP", name: "FDP", unit: "μg/mL", high: 4, source: "SRL" },
  { code: "CRP", name: "CRP", unit: "mg/dL", high: 0.14, source: "共用基準範囲" },
  { code: "PCT", name: "PCT", unit: "ng/mL", high: 0.05, source: "SRL", judgment: "敗血症の鑑別のカットオフ 0.50、重症度判定 2.00 以上（SRL）" },
  { code: "TP", name: "TP", unit: "g/dL", low: 6.6, high: 8.1, source: "共用基準範囲" },
  { code: "Alb", name: "Alb", unit: "g/dL", low: 4.1, high: 5.1, source: "共用基準範囲" },
  { code: "AST", name: "AST", unit: "U/L", low: 13, high: 30, source: "共用基準範囲" },
  { code: "ALT", name: "ALT", unit: "U/L", m: { low: 10, high: 42 }, f: { low: 7, high: 23 }, source: "共用基準範囲" },
  { code: "LDH", name: "LD（IFCC）", unit: "U/L", low: 124, high: 222, source: "共用基準範囲" },
  { code: "ALP", name: "ALP（IFCC）", unit: "U/L", low: 38, high: 113, source: "共用基準範囲" },
  { code: "GGT", name: "γ-GT", unit: "U/L", m: { low: 13, high: 64 }, f: { low: 9, high: 32 }, source: "共用基準範囲" },
  { code: "T-Bil", name: "T-Bil", unit: "mg/dL", low: 0.4, high: 1.5, source: "共用基準範囲" },
  { code: "D-Bil", name: "D-Bil", unit: "mg/dL", high: 0.4, source: "SRL" },
  { code: "ChE", name: "ChE", unit: "U/L", m: { low: 240, high: 486 }, f: { low: 201, high: 421 }, source: "共用基準範囲" },
  { code: "AMY", name: "AMY", unit: "U/L", low: 44, high: 132, source: "共用基準範囲" },
  { code: "CK", name: "CK", unit: "U/L", m: { low: 59, high: 248 }, f: { low: 41, high: 153 }, source: "共用基準範囲" },
  { code: "BUN", name: "BUN", unit: "mg/dL", low: 8, high: 20, source: "共用基準範囲" },
  { code: "Cre", name: "Cre", unit: "mg/dL", m: { low: 0.65, high: 1.07 }, f: { low: 0.46, high: 0.79 }, source: "共用基準範囲" },
  { code: "UA", name: "UA", unit: "mg/dL", m: { low: 3.7, high: 7.8 }, f: { low: 2.6, high: 5.5 }, source: "共用基準範囲" },
  { code: "Na", name: "Na", unit: "mmol/L", low: 138, high: 145, source: "共用基準範囲" },
  { code: "K", name: "K", unit: "mmol/L", low: 3.6, high: 4.8, source: "共用基準範囲" },
  { code: "Cl", name: "Cl", unit: "mmol/L", low: 101, high: 108, source: "共用基準範囲" },
  { code: "Ca", name: "Ca", unit: "mg/dL", low: 8.8, high: 10.1, source: "共用基準範囲" },
  { code: "IP", name: "IP", unit: "mg/dL", low: 2.7, high: 4.6, source: "共用基準範囲" },
  { code: "Mg", name: "Mg", unit: "mg/dL", low: 1.8, high: 2.6, source: "SRL" },
  { code: "Glu", name: "Glu", unit: "mg/dL", low: 73, high: 109, source: "共用基準範囲" },
  { code: "HbA1c", name: "HbA1c（NGSP）", unit: "%", low: 4.9, high: 6.0, source: "共用基準範囲" },
  { code: "TG", name: "TG", unit: "mg/dL", m: { low: 40, high: 234 }, f: { low: 30, high: 117 }, source: "共用基準範囲" },
  { code: "TC", name: "T-Cho", unit: "mg/dL", low: 142, high: 248, source: "共用基準範囲" },
  { code: "HDL", name: "HDL-C", unit: "mg/dL", m: { low: 38, high: 90 }, f: { low: 48, high: 103 }, source: "共用基準範囲" },
  { code: "LDL", name: "LDL-C", unit: "mg/dL", low: 65, high: 163, source: "共用基準範囲" },
  { code: "Fe", name: "Fe", unit: "μg/dL", low: 40, high: 188, source: "共用基準範囲" },
  { code: "UIBC", name: "UIBC", unit: "μg/dL", m: { low: 104, high: 259 }, f: { low: 108, high: 325 }, source: "SRL" },
  { code: "Ferritin", name: "フェリチン", unit: "ng/mL", m: { low: 39.4, high: 340 }, f: { low: 3.6, high: 114 }, source: "SRL" },
  { code: "NH3", name: "NH3", unit: "μg/dL", low: 30, high: 80, source: "SRL" },
  { code: "Lac", name: "乳酸", unit: "mg/dL", low: 3.0, high: 17.0, source: "SRL" },
  { code: "BNP", name: "BNP", unit: "pg/mL", high: 18.4, source: "SRL" },
  { code: "NTproBNP", name: "NT-proBNP", unit: "pg/mL", source: "SRL", judgment: "125未満（心不全の可能性を判断するカットオフ値、SRL）" },
  { code: "TnT", name: "トロポニンT", unit: "ng/mL", high: 0.014, source: "SRL", judgment: "急性心筋梗塞の診断カットオフ 0.100（SRL）" },
  { code: "TSH", name: "TSH", unit: "μIU/mL", low: 0.61, high: 4.23, source: "SRL" },
  { code: "FT4", name: "FT4", unit: "ng/dL", low: 0.75, high: 1.45, source: "SRL" },
  { code: "VCM", name: "VCM", unit: "μg/mL" },
];

/** The reference range for this sex (sex-specific when the source gives one). */
export function rangeFor(a: Analyte, sex: "男" | "女"): { low?: number; high?: number } {
  const r = sex === "男" ? a.m : a.f;
  return r ?? { low: a.low, high: a.high };
}

/**
 * Where and how each item is collected and how long the result takes, after the SRL 総合検査案内
 * 2026-2027 (容器 = SRL の容器記号). The fictional hospital runs most tests in house (当日);
 * items marked 外注 go to an outside lab.
 */
export const LAB_INFO: Record<string, { material: string; container: string; tat: string; note?: string }> = {
  "LAB-CBC": { material: "血液 2.0mL（EDTA-2K）", container: "PK2", tat: "院内・当日" },
  "LAB-WBC": { material: "血液 2.0mL（EDTA-2K）", container: "PK2", tat: "院内・当日" },
  "LAB-HB": { material: "血液 2.0mL（EDTA-2K）", container: "PK2", tat: "院内・当日" },
  "LAB-PLT": { material: "血液 2.0mL（EDTA-2K）", container: "PK2", tat: "院内・当日" },
  "LAB-DIFF": { material: "血液 2.0mL（EDTA-2K）", container: "PK2", tat: "院内・当日" },
  "LAB-RET": { material: "血液 2.0mL（EDTA-2K）", container: "PK2", tat: "院内・当日" },
  "LAB-COAG": { material: "血漿 0.5mL（3.2%クエン酸Na、すぐ遠心）", container: "PC2", tat: "院内・当日" },
  "LAB-PT": { material: "血漿 0.5mL（3.2%クエン酸Na、すぐ遠心）", container: "PC2", tat: "院内・当日" },
  "LAB-APTT": { material: "血漿 0.5mL（3.2%クエン酸Na）", container: "PC2", tat: "院内・当日" },
  "LAB-FIB": { material: "血漿 0.5mL（3.2%クエン酸Na）", container: "PC2", tat: "院内・当日" },
  "LAB-DD": { material: "血漿 0.5mL（3.2%クエン酸Na）", container: "PC2", tat: "院内・当日" },
  "LAB-FDP": { material: "血漿 0.3mL（3.2%クエン酸Na）", container: "PC2", tat: "院内・当日" },
  "LAB-GLU": { material: "血漿 0.5mL（フッ化Na）", container: "PF2", tat: "院内・当日" },
  "LAB-HBA1C": { material: "血液 2.0mL（フッ化Na）", container: "PF2", tat: "院内・当日" },
  "LAB-FERRITIN": { material: "血清 0.4mL", container: "S09", tat: "外注・2〜4日" },
  "LAB-UIBC": { material: "血清 0.5mL", container: "S09", tat: "外注・2〜4日" },
  "LAB-NH3": { material: "血液 1.0mL を除蛋白液容器へ", container: "M40", tat: "院内・当日", note: "採血後すぐ専用容器（除蛋白液）に正確に1.0mL入れ、すぐ遠心" },
  "LAB-LAC": { material: "血液 1.0mL を除蛋白液容器へ", container: "M30", tat: "院内・当日", note: "採血後すぐ専用容器（除蛋白液）に正確に1.0mL入れ、すぐ遠心" },
  "LAB-PCT": { material: "血清 0.4mL", container: "S09", tat: "外注・2〜4日" },
  "LAB-BNP": { material: "血漿 0.5mL（EDTA-2Na、すぐ遠心）", container: "PN2", tat: "院内・当日" },
  "LAB-NTBNP": { material: "血清 0.5mL", container: "S09", tat: "外注・2〜4日" },
  "LAB-TNT": { material: "血清 0.5mL", container: "S09", tat: "院内・当日" },
  "LAB-TSH": { material: "血清 0.5mL", container: "S09", tat: "外注・2〜4日" },
  "LAB-FT4": { material: "血清 0.5mL", container: "S09", tat: "外注・2〜4日" },
  "LAB-BGA": { material: "動脈血（ヘパリン加シリンジ）", container: "血ガス用シリンジ", tat: "院内・すぐ", note: "動脈穿刺は医師が行う。空気を抜いて密栓し、すぐ測る。院内で行った場合だけ算定できる（D007-35）" },
  "LAB-UA": { material: "部分尿 10mL", container: "U40", tat: "院内・当日", note: "院内で行った場合だけ算定できる（D000）" },
  "LAB-UPRO": { material: "蓄尿 0.5mL", container: "U00", tat: "院内・当日" },
  "LAB-UNA": { material: "蓄尿 0.5mL", container: "U00", tat: "院内・当日" },
  "LAB-UK": { material: "蓄尿 0.5mL", container: "U00", tat: "院内・当日" },
  "LAB-UCRE": { material: "蓄尿 0.5mL", container: "U00", tat: "院内・当日" },
  "LAB-BCX": { material: "血液（好気・嫌気ボトル）", container: "血液培養ボトル", tat: "院内・数日" },
  "LAB-UCX": { material: "尿", container: "滅菌容器", tat: "院内・数日" },
  ...MORE_LAB_INFO,
};

/** Default for serum chemistry: 血清 0.5mL, S09（分離剤入り）, 院内・当日. */
export function labInfo(code: string) {
  return LAB_INFO[code] ?? { material: "血清 0.5mL", container: "S09", tat: "院内・当日" };
}

/** Ward rules of the fictional hospital. */
export const WARD_RULES = {
  /** Time of the routine morning blood draw ("明日朝" means this time). */
  routineDrawTime: "06:00",
  /** A drug level timed "before the N-th dose" is drawn this many minutes before that dose. */
  minutesBeforeDoseForLevel: 30,
  /** Clock time of each oral dose timing on this ward. */
  medTimes: { 朝: "08:00", 昼: "12:00", 夕: "18:00", 眠前: "21:00" },
  /** 与薬: giving a dose more than this many minutes before or after its time needs a reason. */
  marWindowMin: 60,
  /** 口頭指示: the doctor signs within this many hours (the fictional hospital's rule). */
  verbalSignHours: 24,
} as const;

export function findDrug(code: string): DrugMaster | undefined {
  return DRUGS.find((d) => d.code === code);
}

export function findLab(code: string): LabMaster | undefined {
  return LAB_TESTS.find((t) => t.code === code);
}

export function findSet(code: string): OrderSet | undefined {
  return ORDER_SETS.find((s) => s.code === code);
}

export function drugLabel(d: DrugMaster): string {
  return `${d.name} ${d.package}`;
}
