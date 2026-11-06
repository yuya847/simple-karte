// 給食（栄養部門）of the fictional hospital: the week's 献立 for each 食種, the 食札 of each patient's meal,
// the ingredients the meals need (発注・在庫, a mock that reaches no supplier), the 検食簿, and a check of each
// patient's day of meals against the doctor's diet order. The menus and their nutrient values are fictional
// (not worked out from the 食品成分表). What the code does: picks the menu of the patient's 食種 (the fictional
// hospital's 約束食事箋), adds up energy・protein・salt, compares them with the order (and, for 常食, with the
// 日本人の食事摂取基準), finds dishes that contain what the patient must not eat, and counts. The 管理栄養士
// decides substitutes and changes; the doctor decides the diet.

import { MEALS, dietAt, dietLabel, findTherapeutic, specialDiet, type DietOrder, type Meal, type Staple } from "./diet";
import type { Sex } from "./types";

export const KITCHEN_SOURCES = {
  special: {
    label: "厚生労働省告示第77号（令和8年3月5日）入院時食事療養及び入院時生活療養の食事の提供たる療養の基準等の一部を改正する件 二（特別食）",
    url: "https://www.mhlw.go.jp/content/12400000/001665216.pdf",
  },
  notice: {
    label: "厚生労働省保険局医療課長通知「入院時食事療養費に係る食事療養及び入院時生活療養費に係る生活療養の実施上の留意事項について」（令和8年3月5日 保医発0305第16号）1(4)(10)、2(1)①、3",
    url: "https://www.mhlw.go.jp/content/12400000/001667180.pdf",
  },
  dri: {
    label: "厚生労働省「日本人の食事摂取基準（2025年版）」策定検討会報告書：たんぱく質の食事摂取基準（推奨量）、ナトリウムの食事摂取基準（食塩相当量の目標量）",
    url: "https://www.mhlw.go.jp/stf/newpage_44138.html",
  },
} as const;

/** What the sources say, in short (shown with the checks). */
export const KITCHEN_RULES = {
  menuNeeded: "特別食加算を行う場合は、特別食の献立表が作成されている必要がある（保医発0305第16号 3）。",
  saltSpecial: "心臓疾患等の減塩食を腎臓食に準じて特別食とするのは、食塩相当量が総量（1日量）6g未満のとき（同 3(1)④）。高血圧症の減塩食は対象外（同③）。",
  general: "一般食の栄養補給量は、医師の食事箋か栄養管理計画によらない場合、食事摂取基準の数値を用いる（同 1(4)ア）。",
  count: "食事提供数は、入院患者ごとに実際に提供された食数を記録する（同 1(10)）。",
  kenshoku: "医師、管理栄養士又は栄養士による検食が毎食行われ、その所見が検食簿に記入されていること（同 2(1)①）。",
} as const;

/** The fictional hospital's rules (shown on the screen as such). */
export const KITCHEN_HOUSE_RULES = {
  lines: "食種ごとの献立の展開（減塩・たんぱく質・脂質の控え方、主食の量）は、院内の約束食事箋に沿っています。",
  tolerance: "献立の1日量が指示のエネルギー・たんぱく質から±10%を超えたら知らせます。食塩は指示の「◯g未満」と比べます。",
  staple: "エネルギーの指示がある食種は、副食の合計を引いた残りを主食の量（10g単位、50〜250g）で合わせます。",
  values: "栄養価は食品成分表から計算したものではありません。",
} as const;

// ---------------------------------------------------------------------------
// Dishes and the week's base menu
// ---------------------------------------------------------------------------

export type DishRole = "主食" | "主菜" | "副菜" | "汁物" | "果物・乳製品";

export interface Dish {
  id: string;
  name: string;
  role: DishRole;
  kcal: number;
  protein: number;
  salt: number;
  /** What it is made from that a patient may have to avoid (アレルギー・禁止食品). */
  contains: string[];
  /** Ingredients per serving, grams (for 発注). */
  items: [string, number][];
}

const d = (id: string, name: string, role: DishRole, kcal: number, protein: number, salt: number, contains: string[], items: [string, number][]): Dish => ({ id, name, role, kcal, protein, salt, contains, items });

/** The fictional dishes (values are fictional). */
export const DISHES: Dish[] = [
  // 朝
  d("miso-tofu", "みそ汁（豆腐・わかめ）", "汁物", 40, 3, 1.5, ["大豆"], [["豆腐", 30], ["わかめ", 2], ["みそ", 12]]),
  d("miso-daikon", "みそ汁（大根）", "汁物", 30, 2, 1.5, ["大豆"], [["大根", 30], ["みそ", 12]]),
  d("miso-hakusai", "みそ汁（白菜）", "汁物", 30, 2, 1.5, ["大豆"], [["白菜", 30], ["みそ", 12]]),
  d("miso-nasu", "みそ汁（なす）", "汁物", 30, 2, 1.5, ["大豆"], [["なす", 30], ["みそ", 12]]),
  d("miso-cabbage", "みそ汁（キャベツ）", "汁物", 30, 2, 1.5, ["大豆"], [["キャベツ", 30], ["みそ", 12]]),
  d("soup-onion", "オニオンスープ", "汁物", 25, 1, 1.2, [], [["玉ねぎ", 40]]),
  d("tamagoyaki", "卵焼き", "主菜", 110, 7, 0.8, ["卵"], [["鶏卵", 60]]),
  d("natto", "納豆", "主菜", 100, 8, 0.6, ["大豆", "納豆"], [["納豆", 40]]),
  d("salmon-s", "鮭の塩焼き（小）", "主菜", 90, 12, 1.0, ["さけ"], [["鮭", 50]]),
  d("scrambled", "スクランブルエッグ", "主菜", 120, 7, 0.6, ["卵", "乳"], [["鶏卵", 60], ["牛乳", 10]]),
  d("tofu-ankake", "豆腐のあんかけ", "主菜", 90, 7, 0.8, ["大豆"], [["豆腐", 100]]),
  d("onsen-tamago", "温泉卵", "主菜", 80, 6, 0.4, ["卵"], [["鶏卵", 50]]),
  d("ohitashi-spinach", "ほうれん草のおひたし", "副菜", 20, 2, 0.5, [], [["ほうれん草", 60]]),
  d("komatsuna-nibitashi", "小松菜の煮びたし", "副菜", 25, 2, 0.6, [], [["小松菜", 60]]),
  d("cabbage-asazuke", "キャベツの浅漬け", "副菜", 15, 1, 0.7, [], [["キャベツ", 50]]),
  d("broccoli-salad", "ブロッコリーのサラダ", "副菜", 60, 3, 0.4, ["卵"], [["ブロッコリー", 50]]),
  d("moyashi-ohitashi", "もやしのおひたし", "副菜", 20, 2, 0.5, [], [["もやし", 60]]),
  d("kabocha-nimono", "かぼちゃの煮物", "副菜", 80, 1.5, 0.5, [], [["かぼちゃ", 70]]),
  d("spinach-goma", "ほうれん草のごま和え", "副菜", 45, 2.5, 0.5, ["ごま"], [["ほうれん草", 60]]),
  d("milk", "牛乳", "果物・乳製品", 134, 6.6, 0.2, ["乳"], [["牛乳", 200]]),
  d("yogurt", "ヨーグルト", "果物・乳製品", 70, 3.5, 0.1, ["乳"], [["ヨーグルト", 80]]),
  // 昼
  d("chicken-teri", "鶏の照り焼き", "主菜", 210, 16, 1.2, ["鶏肉", "小麦", "大豆"], [["鶏もも肉", 80]]),
  d("saba-miso", "さばのみそ煮", "主菜", 200, 16, 1.4, ["さば", "大豆"], [["さば", 70], ["みそ", 8]]),
  d("pork-ginger", "豚肉の生姜焼き", "主菜", 220, 15, 1.3, ["豚肉", "小麦", "大豆"], [["豚肉", 70], ["玉ねぎ", 30]]),
  d("salmon-meuniere", "鮭のムニエル", "主菜", 190, 17, 0.9, ["さけ", "小麦", "乳"], [["鮭", 70]]),
  d("nikujaga", "肉じゃが", "主菜", 230, 9, 1.4, ["牛肉", "小麦", "大豆"], [["牛肉", 40], ["じゃがいも", 80], ["にんじん", 20], ["玉ねぎ", 30]]),
  d("tara-nitsuke", "たらの煮付け", "主菜", 110, 15, 1.2, ["たら", "小麦", "大豆"], [["たら", 80]]),
  d("oyako-ni", "親子煮", "主菜", 200, 15, 1.3, ["鶏肉", "卵", "小麦", "大豆"], [["鶏もも肉", 50], ["鶏卵", 40], ["玉ねぎ", 30]]),
  d("cabbage-goma", "キャベツのごま和え", "副菜", 40, 2, 0.5, ["ごま"], [["キャベツ", 60]]),
  d("hakusai-ohitashi", "白菜のおひたし", "副菜", 15, 1, 0.5, [], [["白菜", 60]]),
  d("daikon-salad", "大根サラダ", "副菜", 35, 1, 0.5, [], [["大根", 60]]),
  d("potato-ni", "じゃがいもの煮物", "副菜", 80, 1.5, 0.6, [], [["じゃがいも", 70]]),
  d("kabocha-salad", "かぼちゃサラダ", "副菜", 100, 2, 0.3, ["卵"], [["かぼちゃ", 60]]),
  d("komatsuna-ae", "小松菜の和え物", "副菜", 25, 2, 0.5, [], [["小松菜", 60]]),
  d("apple", "りんご", "果物・乳製品", 30, 0.1, 0, ["りんご"], [["りんご", 60]]),
  d("banana", "バナナ", "果物・乳製品", 75, 1, 0, ["バナナ"], [["バナナ", 80]]),
  d("mikan", "みかん", "果物・乳製品", 35, 0.5, 0, [], [["みかん", 70]]),
  // 夕
  d("buri-teri", "ぶりの照り焼き", "主菜", 230, 16, 1.2, ["ぶり", "小麦", "大豆"], [["ぶり", 70]]),
  d("hamburg", "ハンバーグ", "主菜", 260, 14, 1.3, ["卵", "小麦", "乳", "牛肉", "豚肉"], [["合いびき肉", 70], ["玉ねぎ", 30], ["鶏卵", 10]]),
  d("chicken-tomato", "鶏肉のトマト煮", "主菜", 200, 16, 1.2, ["鶏肉", "トマト"], [["鶏もも肉", 80], ["トマト", 60]]),
  d("mabo-tofu", "麻婆豆腐", "主菜", 190, 12, 1.5, ["大豆", "豚肉", "小麦"], [["豆腐", 120], ["豚肉", 30]]),
  d("salmon-shio", "鮭の塩焼き", "主菜", 140, 18, 1.3, ["さけ"], [["鮭", 70]]),
  d("pork-itame", "豚肉と野菜の炒め物", "主菜", 210, 14, 1.3, ["豚肉", "小麦", "大豆"], [["豚肉", 60], ["キャベツ", 60], ["にんじん", 20]]),
  d("tara-foil", "たらのホイル焼き", "主菜", 120, 16, 1.0, ["たら", "乳"], [["たら", 80], ["玉ねぎ", 20]]),
  d("chikuzen", "筑前煮", "副菜", 90, 5, 1.0, ["鶏肉", "小麦", "大豆"], [["鶏もも肉", 20], ["にんじん", 30], ["大根", 30]]),
  d("broccoli-saute", "ブロッコリーとにんじんのソテー", "副菜", 50, 2, 0.4, [], [["ブロッコリー", 50], ["にんじん", 20]]),
  d("sunomono", "きゅうりの酢の物", "副菜", 25, 1, 0.6, [], [["きゅうり", 60], ["わかめ", 2]]),
  d("namul", "もやしのナムル", "副菜", 45, 2, 0.6, ["ごま"], [["もやし", 60]]),
  d("hakusai-nibitashi", "白菜の煮びたし", "副菜", 25, 1.5, 0.6, [], [["白菜", 70]]),
  d("nasu-ni", "なすの煮物", "副菜", 45, 1, 0.7, [], [["なす", 70]]),
  d("daikon-ni", "大根の煮物", "副菜", 40, 1, 0.8, [], [["大根", 80]]),
  d("sumashi", "すまし汁", "汁物", 15, 1, 1.2, [], [["わかめ", 2]]),
  d("consomme", "コンソメスープ", "汁物", 20, 1, 1.2, [], [["玉ねぎ", 20], ["にんじん", 10]]),
  d("chinese-soup", "中華スープ", "汁物", 25, 1, 1.2, ["卵"], [["鶏卵", 10]]),
  // 流動食
  d("omoyu", "重湯", "主食", 40, 0.5, 0, [], [["米", 10]]),
  d("miso-clear", "具なしみそ汁", "汁物", 20, 1.5, 1.2, ["大豆"], [["みそ", 10]]),
  d("juice", "りんごジュース", "果物・乳製品", 90, 0.2, 0, ["りんご"], [["りんごジュース", 200]]),
];

const DISH = new Map(DISHES.map((x) => [x.id, x]));
export const dishOf = (id: string) => DISH.get(id);

/** The base menu (常食), by weekday (0 = 日曜) and meal: the dishes besides the staple. */
export const BASE_MENU: Record<number, Record<Meal, string[]>> = {
  0: { 朝: ["miso-tofu", "tamagoyaki", "ohitashi-spinach", "milk"], 昼: ["chicken-teri", "cabbage-goma", "apple"], 夕: ["buri-teri", "chikuzen", "sumashi"] },
  1: { 朝: ["miso-daikon", "natto", "komatsuna-nibitashi", "yogurt"], 昼: ["saba-miso", "hakusai-ohitashi", "banana"], 夕: ["hamburg", "broccoli-saute", "consomme"] },
  2: { 朝: ["miso-hakusai", "salmon-s", "cabbage-asazuke", "milk"], 昼: ["pork-ginger", "daikon-salad", "mikan"], 夕: ["chicken-tomato", "sunomono"] },
  3: { 朝: ["soup-onion", "scrambled", "broccoli-salad", "milk"], 昼: ["salmon-meuniere", "potato-ni", "apple"], 夕: ["mabo-tofu", "namul", "chinese-soup"] },
  4: { 朝: ["miso-nasu", "tofu-ankake", "moyashi-ohitashi", "yogurt"], 昼: ["nikujaga", "ohitashi-spinach", "banana"], 夕: ["salmon-shio", "hakusai-nibitashi", "miso-cabbage"] },
  5: { 朝: ["miso-cabbage", "onsen-tamago", "kabocha-nimono", "milk"], 昼: ["tara-nitsuke", "kabocha-salad", "mikan"], 夕: ["pork-itame", "nasu-ni", "sumashi"] },
  6: { 朝: ["miso-tofu", "natto", "spinach-goma", "yogurt"], 昼: ["oyako-ni", "komatsuna-ae", "apple"], 夕: ["tara-foil", "daikon-ni", "miso-daikon"] },
};

/** 流動食: the same every meal. */
const FLUID_MEAL = ["miso-clear", "juice", "milk"];

// ---------------------------------------------------------------------------
// Staples
// ---------------------------------------------------------------------------

export type StapleKind = Staple | "ゼリー粥" | "低たんぱくご飯" | "重湯";

export interface StapleInfo {
  /** The usual portion. */
  g: number;
  kcal: number;
  protein: number;
  salt: number;
  contains: string[];
  /** The ingredient bought for it, grams per portion. */
  item: [string, number];
}

/** One usual portion of each staple (fictional values). */
export const STAPLES_INFO: Record<StapleKind, StapleInfo> = {
  米飯: { g: 180, kcal: 281, protein: 4.5, salt: 0, contains: [], item: ["米", 80] },
  軟飯: { g: 200, kcal: 226, protein: 3.4, salt: 0, contains: [], item: ["米", 60] },
  全粥: { g: 300, kcal: 195, protein: 3.3, salt: 0, contains: [], item: ["米", 45] },
  七分粥: { g: 300, kcal: 150, protein: 2.5, salt: 0, contains: [], item: ["米", 35] },
  五分粥: { g: 300, kcal: 105, protein: 1.7, salt: 0, contains: [], item: ["米", 25] },
  三分粥: { g: 300, kcal: 60, protein: 1.0, salt: 0, contains: [], item: ["米", 15] },
  パン: { g: 90, kcal: 250, protein: 8, salt: 1.1, contains: ["小麦", "乳"], item: ["食パン", 90] },
  ゼリー粥: { g: 200, kcal: 120, protein: 2, salt: 0, contains: [], item: ["米", 30] },
  低たんぱくご飯: { g: 180, kcal: 290, protein: 0.2, salt: 0, contains: [], item: ["低たんぱくご飯（180gパック）", 180] },
  重湯: { g: 200, kcal: 40, protein: 0.5, salt: 0, contains: [], item: ["米", 10] },
};

// ---------------------------------------------------------------------------
// 食種 (lines of the 約束食事箋) and how each changes the base menu
// ---------------------------------------------------------------------------

export type LineKey = "常食" | "エネルギー調整食" | "減塩食" | "腎臓食" | "肝臓食" | "膵臓食" | "脂質異常症食" | "胃潰瘍食" | "低残渣食" | "嚥下調整食" | "流動食";

export interface LineRule {
  key: LineKey;
  /** What changes from 常食 (shown in the 献立). */
  how: string;
  kcal: number;
  protein: number;
  salt: number;
  drop: DishRole[];
  suffix?: string;
  /** The staple used whatever the order says. */
  staple?: StapleKind;
  /** Fit the staple to the order's energy. */
  fitEnergy?: boolean;
}

/** The fictional hospital's 約束食事箋 (factors applied to the base menu's side dishes). */
export const LINES: LineRule[] = [
  { key: "常食", how: "基本の献立", kcal: 1, protein: 1, salt: 1, drop: [] },
  { key: "エネルギー調整食", how: "油を控え（副食のエネルギー×0.85）、主食の量で指示のエネルギーに合わせる", kcal: 0.85, protein: 1, salt: 0.9, drop: [], fitEnergy: true },
  { key: "減塩食", how: "副食の食塩×0.7、汁物を外す", kcal: 1, protein: 1, salt: 0.7, drop: ["汁物"], suffix: "（減塩）" },
  { key: "腎臓食", how: "主菜を減らし（たんぱく質×0.75）、食塩×0.7、汁物を外す。主食は低たんぱくご飯で、量で指示のエネルギーに合わせる", kcal: 0.9, protein: 0.75, salt: 0.7, drop: ["汁物"], suffix: "（腎臓食）", staple: "低たんぱくご飯", fitEnergy: true },
  { key: "肝臓食", how: "副食のエネルギー×0.95、主食の量で指示のエネルギーに合わせる", kcal: 0.95, protein: 1, salt: 0.8, drop: [], fitEnergy: true },
  { key: "膵臓食", how: "脂質を控え（副食のエネルギー×0.8）、主食の量で指示のエネルギーに合わせる", kcal: 0.8, protein: 0.95, salt: 0.9, drop: [], suffix: "（脂質控えめ）", fitEnergy: true },
  { key: "脂質異常症食", how: "油と脂身を控え（副食のエネルギー×0.85）、主食の量で指示のエネルギーに合わせる", kcal: 0.85, protein: 1, salt: 0.9, drop: [], fitEnergy: true },
  { key: "胃潰瘍食", how: "やわらかく煮て、刺激物を除く（食塩×0.9）", kcal: 1, protein: 1, salt: 0.9, drop: [], suffix: "（やわらか）" },
  { key: "低残渣食", how: "繊維の多い果物を外し、やわらかく煮る", kcal: 1, protein: 1, salt: 1, drop: ["果物・乳製品"], suffix: "（低残渣）" },
  { key: "嚥下調整食", how: "嚥下調整食分類のコードの形に調整し、汁物を外す（エネルギー・たんぱく質×0.85）", kcal: 0.85, protein: 0.85, salt: 0.9, drop: ["汁物"] },
  { key: "流動食", how: "重湯・具なしみそ汁・ジュース・牛乳", kcal: 1, protein: 1, salt: 1, drop: [], staple: "重湯" },
];
export const lineRule = (k: LineKey) => LINES.find((l) => l.key === k)!;

const THERAPEUTIC_LINE: Record<string, LineKey> = {
  "TD-ENERGY": "エネルギー調整食",
  "TD-SALT-HEART": "減塩食",
  "TD-KIDNEY": "腎臓食",
  "TD-LIVER": "肝臓食",
  "TD-PANCREAS": "膵臓食",
  "TD-LIPID": "脂質異常症食",
  "TD-ULCER": "胃潰瘍食",
  "TD-LOWRESIDUE": "低残渣食",
};

/** The menu line a diet order eats from; null for 絶食 and 経管栄養 (no menu). */
export function lineOf(o: DietOrder | undefined): LineKey | null {
  if (!o) return null;
  switch (o.kind) {
    case "常食":
      return "常食";
    case "治療食":
      return (o.therapeutic && THERAPEUTIC_LINE[o.therapeutic]) || null;
    case "嚥下調整食":
      return "嚥下調整食";
    case "流動食":
      return "流動食";
    default:
      return null;
  }
}

export interface Nut {
  kcal: number;
  protein: number;
  salt: number;
}

export interface ServedDish {
  id: string;
  name: string;
  role: DishRole;
  kcal: number;
  protein: number;
  salt: number;
  contains: string[];
  items: [string, number][];
}

export interface MealMenu {
  line: LineKey;
  staple: { kind: StapleKind; g: number };
  dishes: ServedDish[];
  total: Nut;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const add = (a: Nut, b: Nut): Nut => ({ kcal: a.kcal + b.kcal, protein: a.protein + b.protein, salt: a.salt + b.salt });
const ZERO: Nut = { kcal: 0, protein: 0, salt: 0 };

/** The side dishes of a meal for a line (scaled), without the staple. */
function sides(line: LineRule, dow: number, meal: Meal, dysphagia?: string): ServedDish[] {
  const ids = line.key === "流動食" ? FLUID_MEAL : BASE_MENU[((dow % 7) + 7) % 7][meal];
  return ids
    .map((id) => DISH.get(id)!)
    .filter((x) => !line.drop.includes(x.role))
    .map((x) => {
      const suffix = line.key === "嚥下調整食" ? `（コード${dysphagia ?? "?"}）` : x.role === "果物・乳製品" ? "" : (line.suffix ?? "");
      return { id: x.id, name: `${x.name}${suffix}`, role: x.role, kcal: Math.round(x.kcal * line.kcal), protein: r1(x.protein * line.protein), salt: r1(x.salt * line.salt), contains: x.contains, items: x.items };
    });
}

/** The staple of the line and order (ゼリー粥 for 嚥下調整食 0j〜2-2, 全粥 for 3・4). */
function stapleKind(line: LineRule, o: DietOrder): StapleKind {
  if (line.staple) return line.staple;
  if (line.key === "嚥下調整食") return ["3", "4"].includes(o.dysphagia ?? "") ? "全粥" : "ゼリー粥";
  return o.staple ?? "米飯";
}

/** Grams of the staple per meal: the usual portion, or fitted to the order's energy (10 g steps, 50〜250 g). */
export function stapleGrams(line: LineRule, o: DietOrder, dow: number): number {
  const kind = stapleKind(line, o);
  const info = STAPLES_INFO[kind];
  if (!line.fitEnergy || !o.energyKcal) return info.g;
  const sideKcal = MEALS.reduce((n, m) => n + sides(line, dow, m).reduce((s, x) => s + x.kcal, 0), 0);
  const perMeal = (o.energyKcal - sideKcal) / 3;
  const g = Math.round(perMeal / (info.kcal / info.g) / 10) * 10;
  return Math.min(250, Math.max(50, g));
}

/** One meal of one diet order: the staple and dishes with their values, or null when there is no menu. */
export function mealMenu(o: DietOrder | undefined, dow: number, meal: Meal): MealMenu | null {
  const key = lineOf(o);
  if (!o || !key) return null;
  const line = lineRule(key);
  const kind = stapleKind(line, o);
  const info = STAPLES_INFO[kind];
  const g = stapleGrams(line, o, dow);
  const k = g / info.g;
  const staple: ServedDish = { id: `staple-${kind}`, name: `${kind} ${g}g`, role: "主食", kcal: Math.round(info.kcal * k), protein: r1(info.protein * k), salt: r1(info.salt * k), contains: info.contains, items: [[info.item[0], Math.round(info.item[1] * k)]] };
  const dishes = [staple, ...sides(line, dow, meal, o.dysphagia)];
  const total = dishes.reduce((n, x) => add(n, x), ZERO);
  return { line: key, staple: { kind, g }, dishes, total: { kcal: total.kcal, protein: r1(total.protein), salt: r1(total.salt) } };
}

/** The day's three meals of one order (the order's values are per day). */
export function dayTotal(o: DietOrder, dow: number): Nut | null {
  const ms = MEALS.map((m) => mealMenu(o, dow, m));
  if (ms.some((m) => !m)) return null;
  const t = ms.reduce((n, m) => add(n, m!.total), ZERO);
  return { kcal: t.kcal, protein: r1(t.protein), salt: r1(t.salt) };
}

// ---------------------------------------------------------------------------
// Reference values (日本人の食事摂取基準（2025年版）) for 常食
// ---------------------------------------------------------------------------

/** たんぱく質の推奨量（g/日）, adults: 男性 18〜64歳 65・65歳以上 60、女性 18歳以上 50. */
export function proteinRda(age: number, sex: Sex): number | null {
  if (age < 18) return null;
  if (sex === "女") return 50;
  return age >= 65 ? 60 : 65;
}

/** 食塩相当量の目標量（g/日未満）, adults: 男性 7.5・女性 6.5. */
export function saltGoal(age: number, sex: Sex): number | null {
  if (age < 18) return null;
  return sex === "女" ? 6.5 : 7.5;
}

// ---------------------------------------------------------------------------
// The check of the menu against the order
// ---------------------------------------------------------------------------

export type CheckState = "ok" | "over" | "under" | "info";

export interface NutRow {
  label: string;
  menu: number;
  unit: string;
  /** What it is compared with, in words. */
  ref: string;
  state: CheckState;
  /** The result in words. */
  text: string;
  /** order = the doctor's 食事箋, special = 特別食の条件 (通知), dri = 食事摂取基準. */
  from: "order" | "special" | "dri";
}

export const TOLERANCE = 0.1;

function band(label: string, menu: number, want: number, unit: string): NutRow {
  const diff = (menu - want) / want;
  const pct = Math.round(diff * 100);
  const state: CheckState = Math.abs(diff) <= TOLERANCE ? "ok" : diff > 0 ? "over" : "under";
  return { label, menu, unit, ref: `指示 ${want}${unit}`, state, text: state === "ok" ? `指示の±10%以内（${pct >= 0 ? "+" : ""}${pct}%）` : `指示より${state === "over" ? "多い" : "少ない"}（${pct >= 0 ? "+" : ""}${pct}%）`, from: "order" };
}

/** The day's menu of the patient's order against the order (and the 特別食 condition, and the 食事摂取基準 for 常食). */
export function nutritionCheck(o: DietOrder, p: { age: number; sex: Sex }, dow: number): { total: Nut | null; rows: NutRow[] } {
  const total = dayTotal(o, dow);
  if (!total) return { total: null, rows: [] };
  const rows: NutRow[] = [];
  if (o.energyKcal) rows.push(band("エネルギー", total.kcal, o.energyKcal, "kcal"));
  if (o.proteinG) rows.push(band("たんぱく質", total.protein, o.proteinG, "g"));
  if (o.saltG !== undefined) {
    const ok = total.salt < o.saltG;
    rows.push({ label: "食塩相当量", menu: total.salt, unit: "g", ref: `指示 ${o.saltG}g未満`, state: ok ? "ok" : "over", text: ok ? "指示の未満に収まる" : "指示を超える", from: "order" });
  }
  if (o.kind === "治療食" && o.therapeutic === "TD-SALT-HEART") {
    const ok = total.salt < 6;
    rows.push({ label: "特別食（減塩食）", menu: total.salt, unit: "g", ref: "食塩相当量 総量6g未満", state: ok ? "ok" : "over", text: ok ? "献立は6g未満" : "献立が6g以上（特別食の条件に届かない）", from: "special" });
  }
  if (o.kind === "常食") {
    const rda = proteinRda(p.age, p.sex);
    if (rda !== null) rows.push({ label: "たんぱく質", menu: total.protein, unit: "g", ref: `推奨量 ${rda}g（${p.sex}性・${p.age}歳）`, state: total.protein >= rda ? "ok" : "under", text: total.protein >= rda ? "推奨量以上" : "推奨量に届かない", from: "dri" });
    const goal = saltGoal(p.age, p.sex);
    if (goal !== null) rows.push({ label: "食塩相当量", menu: total.salt, unit: "g", ref: `目標量 ${goal}g未満（${p.sex}性）`, state: total.salt < goal ? "ok" : "over", text: total.salt < goal ? "目標量の範囲" : "目標量を超える", from: "dri" });
  }
  return { total, rows };
}

/** The 食種 written on the 食札 and the 献立 (line and the order's values). */
export function ticketType(o: DietOrder): string {
  const key = lineOf(o);
  const t = o.kind === "治療食" ? findTherapeutic(o.therapeutic)?.name : null;
  const vals = [o.energyKcal ? `${o.energyKcal}kcal` : "", o.proteinG ? `たんぱく質${o.proteinG}g` : "", o.saltG ? `塩分${o.saltG}g未満` : ""].filter(Boolean).join("・");
  return `${t ?? key ?? o.kind}${vals ? `（${vals}）` : ""}`;
}

// ---------------------------------------------------------------------------
// Things a patient must not eat: アレルギー (from the chart) and 禁止食品 (recorded by the kitchen)
// ---------------------------------------------------------------------------

export interface Ban {
  /** What not to serve (e.g. 納豆, 生もの, 乳). */
  food: string;
  /** Why, and who said so (本人の申告・主治医の指示 …). */
  why: string;
  by: string;
  at: { day: number; time: string };
}

/** Words that name the same food (for matching what a dish contains). */
const SAME: Record<string, string[]> = {
  卵: ["卵", "たまご", "玉子"],
  乳: ["乳製品", "牛乳", "ミルク", "ヨーグルト", "チーズ"],
  小麦: ["小麦", "パン", "うどん"],
  大豆: ["大豆", "豆腐", "みそ", "しょうゆ"],
  納豆: ["納豆"],
  さけ: ["さけ", "鮭", "サーモン"],
  さば: ["さば", "鯖"],
  たら: ["たら", "鱈"],
  ぶり: ["ぶり", "鰤"],
  ごま: ["ごま", "胡麻"],
  りんご: ["りんご", "林檎"],
  バナナ: ["バナナ"],
  豚肉: ["豚肉", "豚"],
  牛肉: ["牛肉", "牛"],
  鶏肉: ["鶏肉", "鶏"],
  トマト: ["トマト"],
};

/** A word that names a group, matched only as a whole word (「魚」「肉」, not the 魚 of 青魚). */
const GROUPS: Record<string, string[]> = { 魚: ["さけ", "さば", "たら", "ぶり"], 魚類: ["さけ", "さば", "たら", "ぶり"], 青魚: ["さば", "ぶり"], 肉: ["豚肉", "牛肉", "鶏肉"], 肉類: ["豚肉", "牛肉", "鶏肉"] };

/** What in the dish matches the text of an allergy or a 禁止食品 (empty when nothing). */
export function matchesOf(contains: string[], text: string): string[] {
  const words = text.split(/[・、,，\s（）()「」：:／/]+/).filter(Boolean);
  const plain = text.replace(/牛乳/g, "＿＿").replace(/豆乳|乳酸/g, "＿＿");
  return contains.filter((c) => {
    const same = SAME[c] ?? [c];
    // 「牛」 must not match 牛乳, and 乳 is matched by its own words only.
    const hit = c === "牛肉" ? same.some((w) => plain.includes(w)) : same.some((w) => text.includes(w));
    return hit || words.some((w) => GROUPS[w]?.includes(c));
  });
}

export interface Conflict {
  dish: string;
  dishId: string;
  /** The allergy or 禁止食品 it matched, and what in the dish. */
  against: string;
  what: string[];
  kind: "アレルギー" | "禁止食品";
}

/** Dishes of a meal that contain what the patient must not eat. */
export function conflictsOf(menu: MealMenu | null, allergies: string[], bans: Ban[]): Conflict[] {
  if (!menu) return [];
  const out: Conflict[] = [];
  for (const x of menu.dishes) {
    for (const a of allergies) {
      const w = matchesOf(x.contains, a);
      if (w.length) out.push({ dish: x.name, dishId: x.id, against: a, what: w, kind: "アレルギー" });
    }
    for (const b of bans) {
      const w = matchesOf(x.contains, b.food);
      if (w.length) out.push({ dish: x.name, dishId: x.id, against: b.food, what: w, kind: "禁止食品" });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 発注・在庫 (a mock: the order goes to no supplier)
// ---------------------------------------------------------------------------

/** Pack sizes the fictional suppliers sell (grams). */
export const PACKS: Record<string, number> = {
  米: 10000,
  食パン: 2700,
  "低たんぱくご飯（180gパック）": 3600,
  鶏もも肉: 2000,
  豚肉: 2000,
  牛肉: 1000,
  合いびき肉: 1000,
  鮭: 1000,
  さば: 1000,
  たら: 1000,
  ぶり: 1000,
  鶏卵: 3000,
  豆腐: 3000,
  納豆: 1200,
  牛乳: 10000,
  ヨーグルト: 2000,
  りんごジュース: 6000,
};
const DEFAULT_PACK = 1000;
export const packOf = (item: string) => PACKS[item] ?? DEFAULT_PACK;

/** Fictional stock at the start of the day (grams). */
export const INITIAL_STOCK: Record<string, number> = {
  米: 32000,
  食パン: 2700,
  "低たんぱくご飯（180gパック）": 1800,
  鶏もも肉: 3000,
  豚肉: 1500,
  牛肉: 800,
  合いびき肉: 0,
  鮭: 2500,
  さば: 1000,
  たら: 600,
  ぶり: 2000,
  鶏卵: 4500,
  豆腐: 6000,
  納豆: 1600,
  牛乳: 9000,
  ヨーグルト: 3000,
  りんごジュース: 2000,
  みそ: 3000,
  わかめ: 300,
  キャベツ: 5000,
  白菜: 3000,
  大根: 4000,
  玉ねぎ: 4000,
  にんじん: 2000,
  じゃがいも: 3000,
  かぼちゃ: 1000,
  ほうれん草: 1500,
  小松菜: 1500,
  ブロッコリー: 800,
  もやし: 1000,
  きゅうり: 1500,
  なす: 1500,
  トマト: 1500,
  りんご: 2000,
  バナナ: 1500,
  みかん: 2000,
};

export interface Need {
  item: string;
  /** Grams the menus need. */
  need: number;
  stock: number;
  /** Grams short (need − stock), 0 when enough. */
  short: number;
  /** Grams to order: the shortage rounded up to whole packs. */
  order: number;
  pack: number;
}

/** Ingredients the served meals need, against the stock. */
export function needsOf(menus: MealMenu[], stock: Record<string, number>): Need[] {
  const sum = new Map<string, number>();
  for (const m of menus) for (const x of m.dishes) for (const [item, g] of x.items) sum.set(item, (sum.get(item) ?? 0) + g);
  return [...sum.entries()]
    .map(([item, need]) => {
      const have = stock[item] ?? 0;
      const short = Math.max(0, need - have);
      const pack = packOf(item);
      return { item, need, stock: have, short, order: short > 0 ? Math.ceil(short / pack) * pack : 0, pack };
    })
    .sort((a, b) => (b.short > 0 ? 1 : 0) - (a.short > 0 ? 1 : 0) || a.item.localeCompare(b.item, "ja"));
}

export interface PurchaseOrder {
  id: string;
  /** For the meals of this day (offset). */
  forDay: number;
  lines: { item: string; g: number }[];
  by: string;
  at: { day: number; time: string };
  /** 入庫: the goods came in (added to the stock). */
  received?: { day: number; time: string; by: string };
}

// ---------------------------------------------------------------------------
// 検食簿 and the kitchen's records
// ---------------------------------------------------------------------------

export interface Kenshoku {
  by: string;
  role: string;
  time: string;
  /** 所見（味・温度・量・盛り付け・異物など）. */
  text: string;
}

export interface Sub {
  /** 代わりに出すもの. */
  text: string;
  by: string;
  time: string;
}

export interface KitchenDesk {
  received?: Record<string, { by: string; day: number; time: string }>;
  allergySnapshot?: Record<string, string[]>;
  allergyChanges?: KitchenChange[];
  bans: Record<string, Ban[]>;
  /** 代わりの料理, by `${patientId}|${day}|${meal}|${dishId}`. */
  subs: Record<string, Sub>;
  /** Stock (grams) after this session's counts and deliveries; items not here use INITIAL_STOCK. */
  stock: Record<string, number>;
  orders: PurchaseOrder[];
  /** 検食簿, by `${day}|${meal}`. */
  kenshoku: Record<string, Kenshoku>;
}

export const EMPTY_KITCHEN: KitchenDesk = { bans: {}, subs: {}, stock: {}, orders: [], kenshoku: {} };

export const subKey = (patientId: string, day: number, meal: Meal, dishId: string) => `${patientId}|${day}|${meal}|${dishId}`;
export const stockOf = (desk: KitchenDesk, item: string) => desk.stock[item] ?? INITIAL_STOCK[item] ?? 0;
export const stockMap = (desk: KitchenDesk): Record<string, number> => ({ ...INITIAL_STOCK, ...desk.stock });

/** Today's 検食 not written yet for meals already served (by `nowAbs`, minutes from today 00:00). */
export function kenshokuMissing(desk: KitchenDesk, servedTimes: Record<Meal, string>, nowAbs: number): Meal[] {
  return MEALS.filter((m) => {
    const [h, mi] = servedTimes[m].split(":").map(Number);
    return h * 60 + mi <= nowAbs && !desk.kenshoku[`0|${m}`];
  });
}

/** 特別食加算 of a meal as the diet order reads (diet.ts), with the 献立 condition of the notice. */
export function specialOf(o: DietOrder | undefined): { special: boolean; note: string; review?: string } {
  if (!o) return { special: false, note: "" };
  const s = specialDiet(o);
  if (s.special && !lineOf(o)) return { special: false, note: `${s.note}。献立表がないため対象にできない` };
  return s;
}

/** The fictional kitchen records the demo starts with (禁止食品 told by the patients or the doctor). */
export function initialKitchen(): KitchenDesk {
  const at = { day: -1, time: "15:00" };
  return {
    ...EMPTY_KITCHEN,
    bans: {
      "90010198": [{ food: "ごま", why: "本人の申告（苦手。食べられない）", by: "管理栄養士 高橋", at }],
      "90010231": [{ food: "牛乳", why: "本人の申告（飲むとおなかをこわす。乳製品は少量なら食べられる）", by: "管理栄養士 高橋", at }],
    },
  };
}

export interface KitchenChange {
  id: string;
  patientId: string;
  day: number;
  time: string;
  by: string;
  text: string;
}
/** Compare immutable order versions. Only orders issued today for today's/tomorrow's meals. */
export function dietChanges(orders: DietOrder[]): KitchenChange[] {
  return orders.filter(o => o.at.day === 0 && o.from.day >= 0 && o.from.day <= 1).map(o => {
    const previous = dietAt(orders.filter((x, index) => x.id !== o.id && (x.at.day < o.at.day || x.at.day === o.at.day && (x.at.time < o.at.time || x.at.time === o.at.time && index < orders.indexOf(o)))), o.patientId, o.from.day, o.from.meal);
    const action = o.kind === "絶食" ? "食止め" : previous ? "変更" : "新規";
    return { id: `diet:${o.id}`, patientId: o.patientId, day: o.at.day, time: o.at.time, by: o.by, text: `${action}：${o.from.day === 0 ? "今日" : "明日"}${o.from.meal}食から ${previous ? `${dietLabel(previous)} → ` : ""}${dietLabel(o)} ${o.energyKcal ?? "未指定"}kcal・蛋白${o.proteinG ?? "未指定"}g${o.comment ? `・${o.comment}` : ""}` };
  });
}
export function kitchenChanges(orders: DietOrder[], desk: KitchenDesk): KitchenChange[] {
  const bans = Object.entries(desk.bans).flatMap(([patientId, items]) => items.filter(b => b.at.day === 0).map(b => ({ id: `ban:${patientId}:${b.at.day}:${b.at.time}:${b.food}`, patientId, day: b.at.day, time: b.at.time, by: b.by, text: `禁止食品の追加：${b.food}（${b.why}）` })));
  return [...dietChanges(orders), ...(desk.allergyChanges ?? []).filter(c => c.day === 0), ...bans].sort((a,b) => b.time.localeCompare(a.time) || a.id.localeCompare(b.id));
}
export const kitchenWaiting = (orders: DietOrder[], desk: KitchenDesk) => kitchenChanges(orders, desk).filter(c => !desk.received?.[c.id]).length;

/** Profile allergy additions only; removed allergies do not erase an earlier handoff. */
export function allergyChanges(before: Record<string, string[]>, after: Record<string, string[]>, by: string, time: string, version: number): KitchenChange[] {
  return Object.entries(after).flatMap(([patientId, foods]) => !before[patientId] ? [] : foods.filter(food => !before[patientId].includes(food)).map(food => ({ id: `allergy:${patientId}:${version}:${food}`, patientId, day: 0, time, by, text: `アレルギーの追加：${food}` })));
}
