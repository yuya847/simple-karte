// 院内医薬品集 and DI（医薬品情報）: the drugs of the (fictional) hospital master with what their 電子添文 says
// (一般的名称・販売名・規格・規制区分・薬効分類・PMDA へのリンク) and the hospital's own 採用区分. DI notices to the wards
// are 掲示板 posts from 薬剤部 naming the drugs (board.ts). Code searches, sorts and counts who has read a
// notice; the pharmacist writes the notices. Nothing here is written by AI.

import { DRUG_CLASSES, docOf, docUrl, marksOf, type DrugClass } from "./drug-class";
import { csvOf } from "./extract";
import { kanaMatch } from "./kana";
import { DRUGS, ORAL_DRUGS } from "./master";
import { isExpired, type Notice, type Reads } from "./board";

/** 採用区分 of the fictional hospital (架空の病院の取り決め). */
export type Adoption = "採用" | "採用（レジメン限定）" | "採用（麻薬）";

export const ADOPTION_NOTE: Record<Adoption, string> = {
  採用: "院内で処方・注射できる",
  "採用（レジメン限定）": "抗がん薬：院内登録レジメンの欄からだけオーダする",
  "採用（麻薬）": "麻薬：麻薬施用者だけが処方し、麻薬帳簿で受払いを管理する",
};

export interface FormularyItem {
  code: string;
  route: "注射" | "内服";
  /** The master's name and strength or package. */
  name: string;
  spec: string;
  aliases: string[];
  cls: DrugClass;
  adoption: Adoption;
  /** 電子添文 on PMDA and the revision read. */
  url: string;
  revision: string;
}

export function formulary(): FormularyItem[] {
  const out: FormularyItem[] = [];
  for (const d of DRUGS) {
    const cls = DRUG_CLASSES[d.code];
    if (!cls) continue;
    out.push({ code: d.code, route: "注射", name: d.name, spec: d.package, aliases: d.aliases, cls, adoption: d.chemo ? "採用（レジメン限定）" : cls.kisei.includes("麻薬") ? "採用（麻薬）" : "採用", url: docUrl(cls.doc), revision: docOf(cls.doc).revision });
  }
  for (const d of ORAL_DRUGS) {
    const cls = DRUG_CLASSES[d.code];
    if (!cls) continue;
    out.push({ code: d.code, route: "内服", name: d.name, spec: `${d.strength}／${d.unit}`, aliases: d.aliases, cls, adoption: cls.kisei.includes("麻薬") ? "採用（麻薬）" : "採用", url: docUrl(cls.doc), revision: docOf(cls.doc).revision });
  }
  return out;
}

export type KiseiFilter = "" | "麻薬" | "毒薬" | "劇薬" | "ハイリスク" | "処方箋医薬品以外";

export interface FormularyQuery {
  q: string;
  route: "" | "注射" | "内服";
  kisei: KiseiFilter;
  sort: "読み" | "薬効";
}

export const EMPTY_QUERY: FormularyQuery = { q: "", route: "", kisei: "", sort: "読み" };

const words = (x: FormularyItem) => [x.name, x.cls.generic, x.cls.product, x.cls.yakko, ...x.aliases];

/** The items matching the words (any of the names, kana or kanji) and the filters, in the chosen order. */
export function searchFormulary(items: FormularyItem[], f: FormularyQuery): FormularyItem[] {
  const hit = items.filter((x) => {
    if (f.route && x.route !== f.route) return false;
    if (f.kisei === "ハイリスク" && !x.cls.b008) return false;
    if (f.kisei === "処方箋医薬品以外" && x.cls.kisei.includes("処方箋医薬品")) return false;
    if ((f.kisei === "麻薬" || f.kisei === "毒薬" || f.kisei === "劇薬") && !x.cls.kisei.includes(f.kisei)) return false;
    return !f.q.trim() || words(x).some((w) => kanaMatch(w, f.q));
  });
  // 読み順: by the master's name (Japanese collation). 薬効順: by 日本標準商品分類番号, then name.
  const byName = (a: FormularyItem, b: FormularyItem) => a.name.localeCompare(b.name, "ja") || a.spec.localeCompare(b.spec, "ja");
  return [...hit].sort(f.sort === "薬効" ? (a, b) => a.cls.bunrui.localeCompare(b.cls.bunrui) || byName(a, b) : byName);
}

/** 規制区分 in words (e.g. "劇薬・麻薬・処方箋医薬品"), with the ハイリスク group. */
export const kiseiText = (x: FormularyItem): string =>
  [...x.cls.kisei, ...(x.cls.b008 ? [`ハイリスク（${x.cls.b008.group}）`] : [])].join("・") || "（記載なし）";

/** 院内医薬品集 as CSV (for Excel). */
export function formularyCsv(items: FormularyItem[]): string {
  return csvOf(
    ["区分", "院内の名前", "規格", "一般的名称", "電子添文の製品", "規制区分", "薬効分類名", "日本標準商品分類番号", "採用区分", "電子添文", "読んだ版"],
    items.map((x) => [x.route, x.name, x.spec, x.cls.generic, x.cls.product, kiseiText(x), x.cls.yakko, x.cls.bunrui, x.adoption, x.url, x.revision]),
  );
}

export const markKeys = (x: FormularyItem) => marksOf(x.code).map((m) => m.key);

// ---------------------------------------------------------------------------
// DI のお知らせ（掲示板の薬剤部の掲示で、薬の名前のあるもの）
// ---------------------------------------------------------------------------

export const isDi = (n: Notice): boolean => n.from === "薬剤部" && (n.drugs?.length ?? 0) > 0;

/** DI notices (newest first), or those about one drug. Expired ones are kept for the record. */
export function diNotices(notices: Notice[], code?: string): Notice[] {
  return notices.filter((n) => isDi(n) && (!code || n.drugs!.includes(code))).sort((a, b) => b.posted.day - a.posted.day || b.posted.time.localeCompare(a.posted.time));
}

/** Who of `staff` has read it, and who not yet. */
export function readers(n: Notice, reads: Reads, staff: string[]): { read: string[]; unread: string[] } {
  const r = reads[n.id] ?? [];
  return { read: staff.filter((s) => r.includes(s)), unread: isExpired(n) ? [] : staff.filter((s) => !r.includes(s)) };
}

/** What is missing before a DI notice can be put up. */
export function diProblems(p: { title: string; body: string; drugs: string[] }): string[] {
  return [!p.title.trim() && "題名", !p.body.trim() && "本文", p.drugs.length === 0 && "対象の薬"].filter((x): x is string => !!x);
}
