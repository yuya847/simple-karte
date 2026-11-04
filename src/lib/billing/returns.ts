// 返戻・査定の取り込み: the CSV files that 審査支払機関 return through オンライン請求 — 増減点連絡書 (査定) and
// 返戻内訳書 — read in the published layout (「オンライン請求システム操作手順書 別添 印刷対象帳票・CSV・PDF作成
// 対象ファイル＜医療機関（医科・DPC）用＞」), what was cut grouped by 事由 and 箇所, and the 再請求・再審査請求
// a person decides on. Nothing is sent anywhere: オンライン請求 itself is not connected (模擬), and the files
// made here are 模擬 files of fictional patients.

import { checkDigit } from "./insurance";

export const RETURN_SOURCES = [
  {
    label: "医療情報基盤・診療報酬審査支払機構「オンライン請求システム操作手順書 別添 印刷対象帳票・CSV・PDF作成対象ファイル＜医療機関（医科・DPC）用＞」（令和8年10月版）増減点連絡書・返戻内訳書の CSV の記録の形、別表6 事由コード、別表9 年号区分コード",
    url: "https://www.hpdx.or.jp/seikyushiharai/iryokikan/download/download_01.files/csv_ika.pdf",
  },
  { label: "同「増減点連絡書・各種通知書の見方」（記号凡例：増減点箇所・増減点事由）", url: "https://www.hpdx.or.jp/seikyushiharai/mikata/seikyushiharai_04.html" },
];

/** 増減点事由 (別表6 事由コード). */
export const JIYU: Record<string, string> = {
  A: "療養担当規則等に照らし、医学的に保険診療上適応とならないもの",
  B: "療養担当規則等に照らし、医学的に保険診療上過剰・重複となるもの",
  C: "療養担当規則等に照らし、Ａ・Ｂ以外で医学的に保険診療上適当でないもの",
  D: "告示・通知の算定要件に合致していないと認められるもの",
  F: "固定点数誤り",
  G: "請求点数誤り",
  H: "縦計計算誤り",
  K: "その他",
};

/** 増減点箇所 (記号凡例). */
export const KASHO: Record<string, string> = {
  "11": "初診", "12": "再診", "13": "医学管理", "14": "在宅", "21": "内服", "22": "頓服", "23": "外用", "24": "調剤", "25": "処方", "26": "麻毒", "27": "調基", "28": "投薬その他",
  "31": "皮下筋肉内", "32": "静脈内", "33": "注射その他", "39": "薬剤料減点", "40": "処置・薬剤", "50": "手術・薬剤", "54": "麻酔・薬剤", "60": "検査・病理", "70": "画像診断", "80": "その他",
  "90": "入院基本料", "92": "特定入院料・その他", "97": "食事・生活療養標準負担額",
};

/** 年号区分コード (別表9). */
const ERA: Record<string, number> = { "1": 1867, "2": 1911, "3": 1925, "4": 1988, "5": 2018 };

/** GYYMM (和暦) → "YYYY-MM". */
export function fromGyymm(g: string): string | null {
  const m = /^(\d)(\d{2})(\d{2})$/.exec(g.trim());
  if (!m || !ERA[m[1]]) return null;
  return `${ERA[m[1]] + Number(m[2])}-${m[3]}`;
}

/** "YYYY-MM" → GYYMM (令和). */
export function toGyymm(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `5${String(y - ERA["5"]).padStart(2, "0")}${String(m).padStart(2, "0")}`;
}

const zen = (s: string) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
const toNum = (s: string): number | null => {
  const t = zen(s).replace(/[¥￥,，\s]/g, "");
  return /^[+-]?\d+$/.test(t) ? Number(t) : null;
};

/** Shift_JIS bytes as the 審査支払機関 send them (the layout gives no code; the published sample is Shift_JIS). */
export function decodeSjis(bytes: Uint8Array): string {
  return new TextDecoder("shift_jis").decode(bytes);
}

const rows = (text: string): string[][] =>
  text
    .replace(/\u001a/g, "")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.split(","));

export interface ReturnHeader {
  /** 診療月 (増減点連絡書) as "YYYY-MM", or null. */
  month: string | null;
  hospitalCode: string;
  hospitalName: string;
  payer: string;
}

const header = (r: string[]): ReturnHeader => ({ month: fromGyymm(r[1] ?? ""), hospitalCode: r[4] ?? "", hospitalName: r[5] ?? "", payer: r[8] ?? "" });

export type ReturnKind = "増減点連絡書" | "返戻内訳書";

/** Which file it is, from the title row (レコード種別 2). */
export function returnKind(text: string): ReturnKind | null {
  const title = rows(text).find((r) => r[0] === "2");
  if (!title) return null;
  if (title.includes("増減点数（金額）")) return "増減点連絡書";
  if (title.includes("事由コード") && title.includes("請求点数")) return "返戻内訳書";
  return null;
}

// ---------------------------------------------------------------------------
// 増減点連絡書
// ---------------------------------------------------------------------------

export interface ZogenItem {
  /** 箇所1 (診療識別). */
  kasho: string;
  /** 増減点数（金額）. */
  points: number | null;
  /** 事由 (up to two letters). */
  jiyu: string;
  before: string;
  after: string;
}

export interface ZogenReceipt {
  receiptNo: string;
  uketsuke: string;
  month: string | null;
  insurer: string;
  kubun: string;
  name: string;
  karte: string;
  searchNo: string;
  items: ZogenItem[];
  /** 合計 (請求 → 決定, as the file writes them) and the total change. */
  total?: { change: number | null; claimed: number | null; decided: number | null };
}

export interface ZogenFile {
  header: ReturnHeader;
  receipts: ZogenReceipt[];
  problems: string[];
}

/**
 * 増減点連絡書 CSV: 1 = ヘッダ, 2 = タイトル, 3 = 明細の1行目, 4 = 2行目以降, 5 = 合計・食事, 6 = 集計. When the
 * レセプト番号 is the same as the line before, items 2–19 are left out (注1); a line without 増減点数 goes on
 * with the item before (as in the published sample, where 2行目以降 may also be "3").
 */
export function parseZogen(text: string): ZogenFile {
  const problems: string[] = [];
  let head: ReturnHeader = { month: null, hospitalCode: "", hospitalName: "", payer: "" };
  const receipts: ZogenReceipt[] = [];
  let cur: ZogenReceipt | null = null;
  for (const [i, r] of rows(text).entries()) {
    const kind = r[0];
    if (kind === "1") head = header(r);
    else if (kind === "2") continue;
    else if (kind === "3" || kind === "4") {
      if (r.length < 28) problems.push(`${i + 1}行目：項目が ${r.length}（30 のはず）`);
      if (r[2]) {
        cur = { receiptNo: r[2], uketsuke: r[3] ?? "", month: fromGyymm(r[1] ?? "") ?? head.month, insurer: r[7] ?? "", kubun: r[13] ?? "", name: r[17] ?? "", karte: r[18] ?? "", searchNo: r[28] ?? "", items: [] };
        receipts.push(cur);
      }
      if (!cur) {
        problems.push(`${i + 1}行目：どのレセプトの行かわかりません`);
        continue;
      }
      const points = toNum(r[22] ?? "");
      const last = cur.items.at(-1);
      if (points === null && last && !r[23]) {
        if (r[25]) last.before += `／${r[25]}`;
        if (r[27]) last.after += `／${r[27]}`;
      } else cur.items.push({ kasho: r[19] || last?.kasho || "", points, jiyu: r[23] ?? "", before: r[25] ?? "", after: r[27] ?? "" });
    } else if (kind === "5") {
      if (cur && r[20] === "合計") cur.total = { change: toNum(r[22] ?? ""), claimed: toNum(r[25] ?? ""), decided: toNum(r[27] ?? "") };
    } else if (kind !== "6") problems.push(`${i + 1}行目：レコード種別「${kind}」は増減点連絡書にありません`);
  }
  return { header: head, receipts, problems };
}

// ---------------------------------------------------------------------------
// 返戻内訳書
// ---------------------------------------------------------------------------

export interface HenreiReceipt {
  uketsuke: string;
  month: string | null;
  insurer: string;
  kubun: string;
  name: string;
  days: number | null;
  points: number | null;
  code: string;
  reason: string;
  karte: string;
  searchNo: string;
  /** 2行目以降 (公費) の負担者番号. */
  kouhi: string[];
}

export interface HenreiFile {
  header: ReturnHeader;
  receipts: HenreiReceipt[];
  problems: string[];
}

/** 返戻内訳書 CSV: 3 = 明細の1行目, 4 = 2行目以降 (公費の行). */
export function parseHenrei(text: string): HenreiFile {
  const problems: string[] = [];
  let head: ReturnHeader = { month: null, hospitalCode: "", hospitalName: "", payer: "" };
  const receipts: HenreiReceipt[] = [];
  for (const [i, r] of rows(text).entries()) {
    const kind = r[0];
    if (kind === "1") head = header(r);
    else if (kind === "2") continue;
    else if (kind === "3") {
      if (r.length < 19) problems.push(`${i + 1}行目：項目が ${r.length}（20 のはず）`);
      receipts.push({ uketsuke: r[2] ?? "", month: r[1] ? (fromGyymm(r[1]) ?? null) : head.month, insurer: r[3] ?? "", kubun: r[4] ?? "", name: r[6] ?? "", days: toNum(r[7] ?? ""), points: toNum(r[8] ?? ""), code: r[15] ?? "", reason: r[16] ?? "", karte: r[17] ?? "", searchNo: r[18] ?? "", kouhi: [] });
    } else if (kind === "4") {
      const last = receipts.at(-1);
      if (last && r[3]) last.kouhi.push(r[3]);
    } else problems.push(`${i + 1}行目：レコード種別「${kind}」は返戻内訳書にありません`);
  }
  return { header: head, receipts, problems };
}

// ---------------------------------------------------------------------------
// What was cut, by 事由 and 箇所
// ---------------------------------------------------------------------------

export function zogenSummary(files: ZogenFile[]): { byJiyu: { code: string; count: number; points: number }[]; byKasho: { code: string; count: number; points: number }[]; total: number } {
  const items = files.flatMap((f) => f.receipts.flatMap((r) => r.items));
  const group = (key: (i: ZogenItem) => string[]) => {
    const m = new Map<string, { count: number; points: number }>();
    for (const i of items)
      for (const k of key(i)) {
        const g = m.get(k) ?? { count: 0, points: 0 };
        g.count++;
        g.points += i.points ?? 0;
        m.set(k, g);
      }
    return [...m].map(([code, g]) => ({ code, ...g })).sort((a, b) => a.points - b.points || b.count - a.count);
  };
  return {
    byJiyu: group((i) => [...new Set(i.jiyu.split(""))].filter(Boolean)),
    byKasho: group((i) => (i.kasho ? [i.kasho] : [])),
    total: items.reduce((n, i) => n + (i.points ?? 0), 0),
  };
}

// ---------------------------------------------------------------------------
// 再請求・再審査請求の記録
// ---------------------------------------------------------------------------

export type ResubmitKind = "返戻を直して再請求する" | "査定に再審査を請求する" | "査定を受け入れる（請求しない）" | "返戻を請求しない";
export const RESUBMIT_FOR: Record<ReturnKind, ResubmitKind[]> = {
  返戻内訳書: ["返戻を直して再請求する", "返戻を請求しない"],
  増減点連絡書: ["査定に再審査を請求する", "査定を受け入れる（請求しない）"],
};

export interface ResubmitRecord {
  kind: ResubmitKind;
  note: string;
  by: string;
  day: number;
  time: string;
}

export interface ImportedReturn {
  id: string;
  name: string;
  kind: ReturnKind;
  text: string;
  by: string;
  at: string;
}

/** What 医事課 keeps (in this browser): the files read in, and what was decided for each returned receipt. */
export interface ReturnDesk {
  files: ImportedReturn[];
  /** By `${file id}:${受付番号}`. */
  actions: Record<string, ResubmitRecord>;
}

export const EMPTY_RETURNS: ReturnDesk = { files: [], actions: {} };

export const actionKey = (fileId: string, uketsuke: string) => `${fileId}:${uketsuke}`;

// ---------------------------------------------------------------------------
// 模擬のファイル (fictional patients, in the published layout)
// ---------------------------------------------------------------------------

const ZOGEN_TITLE = "2,診療年月,レセプト番号,受付番号,診療科コード,特別審査委員会,明細種別,保険者番号,老人市町村番号,第一公費負担者番号,第二公費負担者番号,第三公費負担者番号,第四公費負担者番号,区分,高額療養費負担区分,職務上の事由,老人減免区分,氏名,カルテ番号等,箇所１,箇所２,法別番号,増減点数（金額）,事由,負担（請求内容）,請求内容,負担（補正・査定後内容）,補正・査定後内容,検索番号,請求情報";
const HENREI_TITLE = "2,診療年月,受付番号,保険者番号,区分,給付区分,氏名,日数,請求点数,薬剤一部負担金,減免区分,一部負担金額,患者負担金額（公費分）,食事・生活基準額,食事・生活標準負担額,事由コード,事由,カルテ番号等,検索番号,請求情報";
export const PAYER_NAME = "医療情報基盤・診療報酬審査支払機構";

const toZen = (n: number | string) => String(n).replace(/\d/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
const insurer = (body: string) => body + checkDigit(body);
const cells = (n: number, set: Partial<Record<number, string>>) => Array.from({ length: n }, (_, i) => set[i] ?? "").join(",");

export interface MockAdjust {
  karte: string;
  name: string;
  kubun: string;
  insurerBody: string;
  claimed: number;
  items: { kasho: string; points: number; jiyu: string; before: string; after: string }[];
}

/** 模擬: fictional 査定 of last month's outpatient receipts of the fictional outpatients (診察券番号 = カルテ番号等). */
export const MOCK_ADJUSTS: MockAdjust[] = [
  { karte: "1000101", name: "石田　正男", kubun: "本外", insurerBody: "0614999", claimed: 980, items: [{ kasho: "60", points: -49, jiyu: "B", before: "ＨｂＡ１ｃ　４９×１", after: "" }] },
  { karte: "1000109", name: "松井　健太", kubun: "本外", insurerBody: "0614998", claimed: 412, items: [{ kasho: "40", points: -35, jiyu: "C", before: "消炎鎮痛等処置（マッサージ等の手技による療法）　３５×２", after: "消炎鎮痛等処置（マッサージ等の手技による療法）　３５×１" }] },
  { karte: "1000110", name: "菅野　礼子", kubun: "高外一", insurerBody: "3914999", claimed: 655, items: [{ kasho: "60", points: -26, jiyu: "D", before: "尿中一般物質定性半定量検査　２６×１", after: "" }] },
];

export const MOCK_RETURNS = [{ karte: "1000108", name: "三浦　和子", kubun: "本外", insurerBody: "0614997", days: 1, points: 1234, code: "L5106", reason: "給付割合の不備です。" }];

/** File names of the layout (a = 1 審査支払機構, bb = 都道府県, c = 1 医科, 医療機関コード, GYYMM = 処理年月). */
export const mockName = (kind: "zogn" | "henr", hospitalCode: string, prefecture: string, processMonth: string) => `RI${kind}1${prefecture}1${hospitalCode}${toGyymm(processMonth)}.csv`;

export function mockZogen(o: { claimMonth: string; processMonth: string; hospitalCode: string; hospitalName: string }): string {
  const yymm = toGyymm(o.processMonth).slice(1);
  const lines = [`1,${toGyymm(o.claimMonth)},1,医科,${o.hospitalCode},${o.hospitalName},,,${PAYER_NAME}`, ZOGEN_TITLE];
  MOCK_ADJUSTS.forEach((a, n) => {
    const no = String(n + 1).padStart(6, "0");
    const uketsuke = `${yymm}-${String(101 + n).padStart(8, "0")}`;
    const ins = insurer(a.insurerBody);
    const houbetsu = ins.slice(0, 2);
    a.items.forEach((it, k) => {
      lines.push(cells(30, { 0: k === 0 ? "3" : "4", ...(k === 0 ? { 2: no, 3: uketsuke, 7: ins, 13: a.kubun, 17: a.name, 18: a.karte, 28: `14${yymm}9100${String(101 + n).padStart(5, "0")}` } : {}), 19: it.kasho, 21: houbetsu, 22: String(it.points), 23: it.jiyu, 24: "1", 25: it.before, 27: it.after }));
    });
    const change = a.items.reduce((s, i) => s + i.points, 0);
    lines.push(cells(30, { 0: "5", 20: "合計", 21: houbetsu, 22: String(change), 25: toZen(a.claimed), 27: toZen(a.claimed + change) }));
  });
  return lines.join("\r\n") + "\r\n";
}

export function mockHenrei(o: { claimMonth: string; processMonth: string; hospitalCode: string; hospitalName: string }): string {
  const yymm = toGyymm(o.processMonth).slice(1);
  const lines = [`1,${toGyymm(o.claimMonth)},1,医科,${o.hospitalCode},${o.hospitalName},,,${PAYER_NAME}`, HENREI_TITLE];
  MOCK_RETURNS.forEach((x, n) => lines.push(cells(20, { 0: "3", 2: `${yymm}-${String(201 + n).padStart(8, "0")}`, 3: insurer(x.insurerBody), 4: x.kubun, 6: x.name, 7: String(x.days), 8: String(x.points), 15: x.code, 16: x.reason, 17: x.karte, 18: `14${yymm}9100${String(201 + n).padStart(5, "0")}` })));
  return lines.join("\r\n") + "\r\n";
}
