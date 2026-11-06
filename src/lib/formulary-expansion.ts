// Client-safe adapters for the selected public rows; no fs or generated JSON import.
import { ADOPTED_INJECTIONS, ADOPTED_ORAL, ADOPTED_TOPICAL, ADOPTED_INGREDIENT_ALIASES, type AdoptedRow } from "./formulary-items";
import type { DrugMaster, OralDrugMaster } from "./master";
import type { InjectionRoute } from "./types";

export const ADOPTION_SOURCE = { label: "医薬品マスター y_20261013.csv（品目・単位・薬価・YJ分類・麻薬等区分）", url: "https://shinryohoshu.mhlw.go.jp/shinryohoshu/downloadMenu/yFile" };
export const adoptedCode = (r: AdoptedRow) => r[0];
export const ADOPTED_ROWS = [...ADOPTED_ORAL, ...ADOPTED_INJECTIONS, ...ADOPTED_TOPICAL];
const normal = (s: string) => s.normalize("NFKC");
const synonyms: [string, string[]][] = [
  ["メロペネム", ["MEPM", "メロペン", "めろぺねむ"]], ["バンコマイシン", ["VCM", "バンコ", "ばんこまいしん"]],
  ["バンコマイシン塩酸塩散", ["VCM 散", "経口VCM", "経口バンコマイシン"]],
  ["セファゾリン", ["CEZ", "セファメジン"]], ["セフトリアキソン", ["CTRX", "ロセフィン"]],
  ["セフェピム", ["CFPM", "マキシピーム"]], ["セフタジジム", ["CAZ", "モダシン"]],
  ["セフメタゾール", ["CMZ", "セフメタゾン"]], ["フロモキセフ", ["FMOX", "フルマリン"]],
  ["タゾ", ["PIPC/TAZ", "TAZ/PIPC", "ゾシン", "タゾピペ", "タゾバクタム・ピペラシリン"]],
  ["スルバクタム", ["SBT/ABPC", "ABPC/SBT", "ユナシン"]],
  ["レボフロキサシン", ["LVFX", "クラビット"]], ["フラジール", ["MNZ", "メトロニダゾール"]],
  ["アネメトロ", ["MNZ", "メトロニダゾール"]], ["ミカファンギン", ["MCFG", "ファンガード"]],
  ["アシクロビル", ["ACV", "ゾビラックス"]], ["リネゾリド", ["LZD", "ザイボックス"]],
  ["ダプトマイシン", ["DAP", "キュビシン"]], ["テイコプラニン", ["TEIC", "タゴシッド"]],
  ["ヒューマリンR", ["インスリン", "ヒトインスリン", "速効型インスリン"]],
  ["ノボラピッド", ["インスリン", "インスリンアスパルト"]], ["ヒューマログ", ["インスリン", "インスリンリスプロ"]],
  ["ランタス", ["インスリン", "インスリングラルギン"]], ["トレシーバ", ["インスリン", "インスリンデグルデク"]],
];
export function adoptedAliases(r: AdoptedRow): string[] {
  const names = [...(ADOPTED_INGREDIENT_ALIASES[r[4].slice(0, 7)] ?? []), normal(r[1]), normal(r[5]).replace("【般】", ""), ...synonyms.filter(([key]) => normal(r[1]).includes(key)).flatMap(([, words]) => words)].filter(Boolean);
  return [...new Set([...names, ...names.map((n) => n.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)))])];
}
const unitOf = (r: AdoptedRow) => normal(r[2]);
const isInsulin = (r: AdoptedRow) => /ヒューマリン|ノボリン|ノボラピッド|ヒューマログ|アピドラ|ランタス|トレシーバ|ライゾデグ|フィアスプ|ルムジェブ|インスリン|レベミル/.test(normal(r[1]));
const isChemo = (r: AdoptedRow) => /^(421|422|423|424|425|426|427|428|429)/.test(r[4]);
const routesOf = (r: AdoptedRow): InjectionRoute[] => {
  const n = normal(r[1]);
  if (isInsulin(r)) return ["皮下注"];
  if (/ノルアドレナリン|ドパミン|イノバン|ドブタミン|ドブトレックス|ミルリノン|ミルリーラ|オルプリノン|コアテック|ハンプ|リトドリン|ウテメリン|プレセデックス|デクスメデトミジン/.test(n)) return ["点滴静注"];
  if (/レミフェンタニル/.test(n)) return ["点滴静注"];
  if (/モルヒネ|オキシコドン|ナルベイン|フェンタニル/.test(n)) return ["静注", "皮下注"];
  if (/補正用|KCL|塩化カリウム|リン酸二カリウム|リン酸Na/.test(n)) return ["点滴静注"];
  if (/筋注用|筋肉注射/.test(n)) return ["筋注"];
  if (/皮下注|テリボン|フォルテオ|プラリア|ジーラスタ/.test(n)) return ["皮下注"];
  if (/ミールビック|水痘|麻しん|風しん|インフルエンザHA/.test(n)) return ["皮下注"];
  if (/プレベナー|バクニュバンス/.test(n)) return ["筋注"];
  if (/エイムゲン|ビームゲン|ヘプタバックス|ニューモバックス|トキソイド/.test(n)) return ["皮下注", "筋注"];
  if (/点滴|輸液|糖液|生食|生理食塩|アルブミン|蒸留水|注射用水/.test(n)) return ["点滴静注"];
  return ["静注"];
};
export const MORE_DRUGS: DrugMaster[] = ADOPTED_INJECTIONS.map((r) => {
  const n = normal(r[1]), u = unitOf(r);
  const packageUnit: "A" | "V" | "袋" | "キット" | undefined = u === "管" ? "A" : u === "瓶" ? "V" : u === "袋" ? "袋" : u === "キット" ? "キット" : undefined;
  const mass = n.match(/(\d+(?:\.\d+)?)(mg|g)(?!\/) /) ?? n.match(/(\d+(?:\.\d+)?)(mg|g)(?=[「　\s)]|$)/);
  const volume = r[7] || Number([...n.matchAll(/(\d+(?:\.\d+)?)mL/g)].at(-1)?.[1] ?? 0);
  const electrolyte = n.match(/(\d+(?:\.\d+)?)mEq\/mL/);
  const strength: DrugMaster["strength"] = packageUnit && electrolyte && volume ? { amount: Number(electrolyte[1]) * volume, unit: "mEq", per: packageUnit } : packageUnit && mass ? { amount: Number(mass[1]), unit: mass[2] as "mg" | "g", per: packageUnit } : undefined;
  return { code: r[0], name: n.trim(), generic: r[5].replace("【般】", ""), category: isInsulin(r) ? "インスリン" : undefined,
    package: isInsulin(r) && u.includes("mL") ? "10mL バイアル" : mass ? `${mass[1]}${mass[2]}/${packageUnit ?? u}` : volume > 0 ? `${volume}mL/${packageUnit ?? u}` : `1${u}`, kind: /^(611|612|613|614|615|616|624|641)/.test(r[4]) ? "抗菌薬" : /^(323|325|331)/.test(r[4]) ? "輸液" : "その他",
    routes: routesOf(r), units: isInsulin(r) ? ["単位"] : [...(packageUnit ? [packageUnit] : [u]), ...(strength ? [strength.unit, ...(strength.unit === "g" ? ["mg"] : [])] : []), ...(volume > 0 && (packageUnit || u === "筒") ? ["mL"] : [])],
    ...(strength ? { strength } : {}), ...(volume > 0 && (packageUnit || u === "筒") ? { volumeMl: volume } : {}),
    // Amount of insulin per official billing unit (mL or one pen/cartridge).
    ...(isInsulin(r) ? { insulinUnitsPerBillingUnit: u.includes("mL") ? 100 : 300 } : {}),
    chemo: isChemo(r), aliases: adoptedAliases(r) };
});
// Oral cytotoxic/immunomodulatory cancer drugs remain in the formulary only until an oral regimen workflow exists.
export const MORE_ORAL_DRUGS: OralDrugMaster[] = ADOPTED_ORAL.filter((r) => !isChemo(r)).map((r) => ({
  code: r[0], name: normal(r[1]).trim(), strength: normal(r[1]).match(/\d+(?:\.\d+)?(?:mg|μg|%)/)?.[0] ?? r[2],
  unit: r[0] === "620008047" ? "g" : unitOf(r) as OralDrugMaster["unit"],
  ...(r[0] === "620008047" ? { billingUnitsPerDoseUnit: 2 } : {}),
  scored: false, aliases: adoptedAliases(r),
}));
export const TOPICAL_DRUGS = ADOPTED_TOPICAL.map((r) => ({ code: r[0], name: normal(r[1]).trim(), spec: r[2], aliases: adoptedAliases(r) }));
export const FORMULARY_ONLY_ORAL = ADOPTED_ORAL.filter(isChemo).map((r) => ({ code: r[0], name: normal(r[1]).trim(), spec: r[2], aliases: adoptedAliases(r) }));
