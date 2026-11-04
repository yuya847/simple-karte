// 麻薬の管理: 麻薬帳簿（受払簿）, 施用票, 施用残液・空アンプルの返納と立会いの廃棄, 病棟からの返納と調剤済麻薬の廃棄,
// 事故届の入口, 在庫との照合. Code keeps the book and does the arithmetic (残高, 施用量＋残量＝払い出した量, the
// 30-day limit of the 廃棄届); people count, witness and sign. How each entry is written follows the ministry's
// 「病院・診療所における麻薬管理マニュアル」（平成23年4月）第6・第7・第8 (sources in narcotics.ts):
//
// - 帳簿は品名・剤型・濃度ごとの口座、金銭出納簿の形（受入・払出・残高・備考）。記載は受払いの都度。
// - 注射剤は A（アンプル）単位。払出は薬局から出した日ではなく施用の日に記載する。施用残は備考に mL で、麻薬管理者が
//   他の職員1名以上の立会いの下に廃棄し、立会者が署名する（届出は要らない）。
// - 内服は麻薬処方箋で調剤した日に払出。病棟から返納された残りは受入欄に（ ）書きで、残高に加えない。廃棄は立会いの
//   下に行い、30日以内に調剤済麻薬廃棄届（法 第35条第2項）。
// - 滅失・盗取・破損・流失・所在不明などの事故は、すみやかに麻薬事故届（法 第35条第1項）。備考に記載し写しを保管。
// - 定期的に帳簿残高と在庫現品を照合する（第3 (10)）。
//
// Nothing is sent anywhere: the 届 here are drafts for a person to file (模擬).

import { isNarcotic } from "./drug-class";
import { NARCOTIC_MANAGER } from "./narcotics";
import { findDrug, findOralDrug } from "./master";
import type { DayOffset, InjectionItem, OrderEntry, PrescriptionOrder } from "./types";

export interface When {
  day: DayOffset;
  time: string;
}

export type LedgerKind = "繰越" | "受入" | "払出" | "返納" | "持参" | "事故" | "照合";

export interface LedgerEntry {
  id: string;
  /** The account (口座): one master item = one 品名・剤型・濃度. */
  code: string;
  at: When;
  kind: LedgerKind;
  /** Units (A or 錠): + into the stock, − out of it; 0 for 返納 and 照合. */
  qty: number;
  /** 返納: the number in （ ） — written in 受入 and not added to the 残高. */
  paren?: number;
  /** 備考. */
  note: string;
  by: string;
  patientId?: string;
  orderId?: string;
  slipId?: string;
  /** 施用残液の廃棄 (on the 払出 of an injection) or the 廃棄 of what a ward returned (on a 返納). */
  disposal?: { amount: string; by: string; witness: string; at: When; method: string };
  /** 調剤済麻薬廃棄届 for a 返納 that was destroyed: due 30 days after (法 第35条第2項). filedOn = sent (模擬). */
  notice?: { dueDay: DayOffset; filedOn?: DayOffset };
}

/** 麻薬施用票 (マニュアル 第5 様式(2)): one per dose of a 麻薬 injection, filled in on the ward and returned with the ampoules. */
export interface UseSlip {
  id: string;
  orderId: string;
  patientId: string;
  code: string;
  /** The MAR dose it is for (mar.ts marKey). */
  marKey: string;
  usedAt: When;
  /** Ampoules handed to the ward for this dose. */
  issuedA: number;
  usedMl: number;
  leftMl: number;
  unusedA: number;
  prescriber: string;
  /** Who gave it and filled in the slip (返納者). */
  by: string;
  returnedAt: When;
  /** 返品・残液受領者 (the pharmacy). */
  received?: { by: string; at: When };
}

export type AccidentKind = "破損・流失" | "所在不明" | "盗取" | "その他";
export const ACCIDENT_KINDS: AccidentKind[] = ["破損・流失", "所在不明", "盗取", "その他"];

export interface Accident {
  id: string;
  code: string;
  /** Units lost (A or 錠). For a broken ampoule, the whole ampoule. */
  qty: number;
  kind: AccidentKind;
  /** 事故の状況 as the 麻薬管理者 writes it. */
  text: string;
  at: When;
  by: string;
  /** 麻薬事故届 handed in (模擬: nothing is sent). */
  filedAt?: When;
  /** The 事故 line of the book. */
  ledgerId: string;
}

export interface NarcoticBook {
  ledger: LedgerEntry[];
  slips: UseSlip[];
  accidents: Accident[];
  /** 院内の麻薬処方箋: the 署名 checked by the pharmacist (order id → who, when). */
  signed: Record<string, { by: string; at: When }>;
}

/** The fictional wholesaler and product numbers of the first stock. */
export const WHOLESALER = "みどり薬品（架空の麻薬卸売業者）";

export const INITIAL_BOOK: NarcoticBook = {
  ledger: [
    { id: "nl-1", code: "INJ-MOR10", at: { day: -4, time: "08:30" }, kind: "繰越", qty: 5, note: "前帳簿から繰越し", by: NARCOTIC_MANAGER },
    { id: "nl-2", code: "INJ-MOR10", at: { day: -4, time: "10:00" }, kind: "受入", qty: 10, note: `${WHOLESALER}から購入 製品番号 M2611A（架空）`, by: NARCOTIC_MANAGER },
    { id: "nl-3", code: "ORAL-OXC5", at: { day: -4, time: "08:30" }, kind: "繰越", qty: 20, note: "前帳簿から繰越し", by: NARCOTIC_MANAGER },
    { id: "nl-4", code: "ORAL-OXC5", at: { day: -4, time: "10:00" }, kind: "受入", qty: 20, note: `${WHOLESALER}から購入 製品番号 X2610B（架空）`, by: NARCOTIC_MANAGER },
    { id: "nl-5", code: "INJ-MOR10", at: { day: -1, time: "17:00" }, kind: "照合", qty: 0, note: "帳簿残高 15A・在庫 15A（一致）", by: NARCOTIC_MANAGER },
    { id: "nl-6", code: "ORAL-OXC5", at: { day: -1, time: "17:00" }, kind: "照合", qty: 0, note: "帳簿残高 40錠・在庫 40錠（一致）", by: NARCOTIC_MANAGER },
  ],
  slips: [],
  accidents: [],
  signed: {},
};

const at = (w: When) => w.day * 1440 + Number(w.time.slice(0, 2)) * 60 + Number(w.time.slice(3, 5));

export const unitOf = (code: string): string => (findDrug(code) ? "A" : (findOralDrug(code)?.unit ?? ""));

/** mL in one ampoule (the master's package "10mg/1mL/A" → 1). */
export function mlPerAmpoule(code: string): number | null {
  const m = findDrug(code)?.package.match(/\/([\d.]+)mL\/A$/);
  return m ? Number(m[1]) : null;
}

/** 残高 of an account: every entry's qty; （ ） 返納 are not added (マニュアル 第6 2 ※3). */
export function balance(ledger: LedgerEntry[], code: string): number {
  return ledger.filter((e) => e.code === code).reduce((s, e) => s + e.qty, 0);
}

/** The account in order, with the running 残高. */
export function accountRows(ledger: LedgerEntry[], code: string): (LedgerEntry & { rest: number })[] {
  let rest = 0;
  return ledger
    .filter((e) => e.code === code)
    .sort((a, b) => at(a.at) - at(b.at))
    .map((e) => ({ ...e, rest: (rest += e.qty) }));
}

// ---------------------------------------------------------------------------
// 施用票（注射）
// ---------------------------------------------------------------------------

/** Ampoules and mL a dose needs, from the order's amount (mg, mL or A) and the ampoule's strength. */
export function doseOf(item: InjectionItem): { ampoules: number; ml: number } | null {
  const d = findDrug(item.drugCode);
  const per = mlPerAmpoule(item.drugCode);
  if (!d?.strength || per === null) return null;
  const mgPerMl = d.strength.amount / per;
  const ml = item.unit === "mL" ? item.amount : item.unit === "A" ? item.amount * per : item.unit === d.strength.unit ? item.amount / mgPerMl : NaN;
  if (!Number.isFinite(ml) || ml <= 0) return null;
  return { ampoules: Math.ceil(ml / per - 1e-9), ml: Math.round(ml * 100) / 100 };
}

/** What is wrong with a 施用票 before it can be returned: 施用量＋残量＋未使用の A が払い出した量に合うか（code）. */
export function slipProblems(s: Pick<UseSlip, "code" | "issuedA" | "usedMl" | "leftMl" | "unusedA">): string[] {
  const per = mlPerAmpoule(s.code);
  const out: string[] = [];
  if (per === null) return ["アンプルの容量がマスターにありません"];
  if (!(s.issuedA > 0)) out.push("払い出した数（A）");
  if (s.usedMl < 0 || s.leftMl < 0 || s.unusedA < 0) out.push("マイナスの量");
  if (s.unusedA > s.issuedA) out.push("未使用のアンプルが払い出した数より多い");
  const opened = (s.issuedA - s.unusedA) * per;
  if (Math.abs(s.usedMl + s.leftMl - opened) > 0.001) out.push(`施用量 ${s.usedMl}mL ＋ 残量 ${s.leftMl}mL が開けた ${s.issuedA - s.unusedA}A（${opened}mL）に合いません`);
  return out;
}

/** The pharmacy receives a slip with its ampoules: the 払出 is written on the 施用 day, in A (マニュアル 記載例３). */
export function receiveSlip(book: NarcoticBook, slipId: string, by: string, now: When, patientLabel: string, newId: () => string): NarcoticBook {
  const s = book.slips.find((x) => x.id === slipId);
  if (!s || s.received) return book;
  const used = s.issuedA - s.unusedA;
  const entry: LedgerEntry = {
    id: newId(),
    code: s.code,
    at: s.usedAt,
    kind: "払出",
    qty: -used,
    note: `${patientLabel}　施用 ${s.usedMl}mL${s.leftMl > 0 ? `・施用残 ${s.leftMl}mL（返納）` : ""}${s.unusedA ? `・未使用 ${s.unusedA}A は在庫へ` : ""}`,
    by,
    patientId: s.patientId,
    orderId: s.orderId,
    slipId: s.id,
  };
  return { ...book, slips: book.slips.map((x) => (x.id === slipId ? { ...x, received: { by, at: now } } : x)), ledger: used > 0 ? [...book.ledger, entry] : book.ledger };
}

/** Why a 廃棄 cannot be written yet: a witness other than the one destroying it (他の職員1名以上の立会い). */
export function witnessProblem(by: string, witness: string): string | null {
  if (!witness.trim()) return "立会者を選んでください（麻薬管理者のほかの職員1名以上の立会いが要ります）。";
  if (witness === by) return "立会者は廃棄する人とは別の職員です。";
  return null;
}

/** 施用残液の廃棄: on the 払出 entry, in mL, with the witness (届出は要らない：マニュアル 第7 1(3)). */
export function disposeLeftover(book: NarcoticBook, ledgerId: string, by: string, witness: string, method: string, now: When): NarcoticBook {
  if (witnessProblem(by, witness)) return book;
  return {
    ...book,
    ledger: book.ledger.map((e) => {
      if (e.id !== ledgerId || e.disposal || !e.slipId) return e;
      const s = book.slips.find((x) => x.id === e.slipId);
      if (!s || s.leftMl <= 0) return e;
      return { ...e, disposal: { amount: `${s.leftMl}mL`, by, witness, at: now, method } };
    }),
  };
}

// ---------------------------------------------------------------------------
// 内服（麻薬処方箋で調剤）
// ---------------------------------------------------------------------------

/** Tablets an oral 麻薬 order needs: 1回量 × 回数 × 日数 (code; null when the days are missing or it is 頓用). */
export function oralQty(o: PrescriptionOrder): { qty: number; formula: string } | null {
  if (!o.days || o.timings.length === 0) return null;
  const qty = o.amount * o.timings.length * o.days;
  return { qty, formula: `1回${o.amount}${o.unit} × ${o.timings.length}回 × ${o.days}日 ＝ ${qty}${o.unit}` };
}

/** The 払出 already written for an order (one per 麻薬処方箋). */
export const dispensedFor = (book: NarcoticBook, orderId: string) => book.ledger.find((e) => e.kind === "払出" && e.orderId === orderId && !e.slipId);

/** Why an oral 麻薬 cannot be dispensed now, or null. */
export function oralBlock(book: NarcoticBook, entry: OrderEntry, rxOk: boolean): string | null {
  if (entry.order.type !== "prescription") return "内服のオーダではありません";
  if (dispensedFor(book, entry.id)) return "この麻薬処方箋はもう払い出しています";
  if (!rxOk) return "麻薬処方箋の記載事項に足りないものがあります";
  if (!book.signed[entry.id]) return "麻薬処方箋の署名を確かめてから払い出します";
  const q = oralQty(entry.order);
  if (!q) return "日数のない処方は量を数えられません（頓用は回数を決めて処方してもらう）";
  if (q.qty > balance(book.ledger, entry.order.drugCode)) return `帳簿の残高（${balance(book.ledger, entry.order.drugCode)}${entry.order.unit}）が足りません`;
  return null;
}

export function dispenseOral(book: NarcoticBook, entry: OrderEntry, patientId: string, by: string, now: When, patientLabel: string, newId: () => string): NarcoticBook {
  if (entry.order.type !== "prescription") return book;
  const q = oralQty(entry.order);
  if (!q || dispensedFor(book, entry.id)) return book;
  return {
    ...book,
    ledger: [...book.ledger, { id: newId(), code: entry.order.drugCode, at: now, kind: "払出", qty: -q.qty, note: `${patientLabel}　${q.formula}`, by, patientId, orderId: entry.id }],
  };
}

/** A ward returns what was not taken: written in （ ）, not added to the 残高. */
export function returnFromWard(book: NarcoticBook, code: string, qty: number, by: string, now: When, patientLabel: string, orderId: string | undefined, newId: () => string): NarcoticBook {
  if (!(qty > 0)) return book;
  return { ...book, ledger: [...book.ledger, { id: newId(), code, at: now, kind: "返納", qty: 0, paren: qty, note: `${patientLabel}より返納`, by, orderId }] };
}

/**
 * A 麻薬 the patient brought in (転入院時の持参) and goes on taking: written in （ ） in 受入, not added to the 残高
 * (マニュアル 第4(11)). `refId` is the 持参薬鑑別 report.
 */
export function recordBrought(book: NarcoticBook, code: string, qty: number, by: string, now: When, patientLabel: string, refId: string, newId: () => string): NarcoticBook {
  if (!(qty > 0) || book.ledger.some((e) => e.kind === "持参" && e.orderId === refId && e.code === code)) return book;
  return { ...book, ledger: [...book.ledger, { id: newId(), code, at: now, kind: "持参", qty: 0, paren: qty, note: `${patientLabel} 転入院時持参・継続施用（持参薬鑑別より）`, by, orderId: refId }] };
}

/** 廃棄 of what a ward returned, with a witness; the 調剤済麻薬廃棄届 is due within 30 days (法 第35条第2項). */
export function disposeReturned(book: NarcoticBook, ledgerId: string, by: string, witness: string, method: string, now: When): NarcoticBook {
  if (witnessProblem(by, witness)) return book;
  return {
    ...book,
    ledger: book.ledger.map((e) => (e.id === ledgerId && e.kind === "返納" && !e.disposal ? { ...e, disposal: { amount: `${e.paren}${unitOf(e.code)}`, by, witness, at: now, method }, notice: { dueDay: now.day + 30 } } : e)),
  };
}

export function fileNotice(book: NarcoticBook, ledgerId: string, day: DayOffset): NarcoticBook {
  return { ...book, ledger: book.ledger.map((e) => (e.id === ledgerId && e.notice && e.notice.filedOn === undefined ? { ...e, notice: { ...e.notice, filedOn: day } } : e)) };
}

// ---------------------------------------------------------------------------
// 受入・事故・照合
// ---------------------------------------------------------------------------

export function receiveStock(book: NarcoticBook, code: string, qty: number, lot: string, by: string, now: When, newId: () => string): NarcoticBook {
  if (!(qty > 0) || !lot.trim()) return book;
  return { ...book, ledger: [...book.ledger, { id: newId(), code, at: now, kind: "受入", qty, note: `${WHOLESALER}から購入 製品番号 ${lot.trim()}`, by }] };
}

/** An accident: out of the 残高 at once, noted in the book, and a 麻薬事故届 to file without delay (法 第35条第1項). */
export function recordAccident(book: NarcoticBook, a: Omit<Accident, "id" | "ledgerId">, newId: () => string): NarcoticBook {
  if (!(a.qty > 0) || !a.text.trim()) return book;
  const id = newId();
  const ledgerId = newId();
  return {
    ...book,
    accidents: [...book.accidents, { ...a, id, ledgerId }],
    ledger: [...book.ledger, { id: ledgerId, code: a.code, at: a.at, kind: "事故", qty: -a.qty, note: `${a.kind}：${a.text.trim()}（麻薬事故届：未提出）`, by: a.by }],
  };
}

export function fileAccident(book: NarcoticBook, id: string, now: When): NarcoticBook {
  const a = book.accidents.find((x) => x.id === id);
  if (!a || a.filedAt) return book;
  return {
    ...book,
    accidents: book.accidents.map((x) => (x.id === id ? { ...x, filedAt: now } : x)),
    ledger: book.ledger.map((e) => (e.id === a.ledgerId ? { ...e, note: e.note.replace("（麻薬事故届：未提出）", `（麻薬事故届 提出 ${now.time}・模擬）`) } : e)),
  };
}

/** The 麻薬事故届 text for a person to file (模擬: nothing is sent). */
export function accidentText(a: Accident, drugName: string, manager: string, licence: string, date: string): string {
  return [
    "麻薬事故届（模擬・都道府県知事あて）",
    `届出年月日：${date}`,
    `麻薬業務所：架空総合病院（麻薬診療施設）`,
    `届出者：麻薬管理者 ${manager}（免許証の番号 ${licence}）`,
    `品名：${drugName}`,
    `数量：${a.qty}${unitOf(a.code)}`,
    `事故の種類：${a.kind}`,
    `事故の状況：${a.text.trim()}`,
    a.kind === "盗取" ? "盗取のため、警察署にも届け出ること（マニュアル 第8 ①）。" : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 在庫との照合: the count is written as a line; a difference is shown, not explained. */
export function countStock(book: NarcoticBook, code: string, counted: number, by: string, now: When, newId: () => string): NarcoticBook {
  const rest = balance(book.ledger, code);
  const u = unitOf(code);
  return { ...book, ledger: [...book.ledger, { id: newId(), code, at: now, kind: "照合", qty: 0, note: `帳簿残高 ${rest}${u}・在庫 ${counted}${u}（${rest === counted ? "一致" : `差 ${counted - rest}${u}。事故届の要否を確かめる`}）`, by }] };
}

// ---------------------------------------------------------------------------
// 病棟の側：施用票を書く dose
// ---------------------------------------------------------------------------

export interface SlipDue {
  key: string;
  entry: OrderEntry;
  patientId: string;
  at: number;
  doneAt: string;
  by: string;
  item: InjectionItem;
}

/** 麻薬 injection doses recorded 実施 that have no 施用票 yet (the ward fills one in and returns the ampoules). */
export function slipsDue(
  people: { patient: { id: string }; entries: OrderEntry[] }[],
  records: Record<string, { key: string; orderId: string; patientId: string; status: string; at: number; doneAt: string; by: string }>,
  book: NarcoticBook,
): SlipDue[] {
  const done = new Set(book.slips.map((s) => s.marKey));
  const out: SlipDue[] = [];
  for (const r of Object.values(records)) {
    if (r.status !== "実施" || done.has(r.key)) continue;
    const x = people.find((p) => p.patient.id === r.patientId);
    const e = x?.entries.find((y) => y.id === r.orderId);
    if (!e || e.order.type !== "injection") continue;
    const item = e.order.items.find((i) => mlPerAmpoule(i.drugCode) !== null && isNarcotic(i.drugCode));
    if (item) out.push({ key: r.key, entry: e, patientId: r.patientId, at: r.at, doneAt: r.doneAt, by: r.by, item });
  }
  return out.sort((a, b) => a.at - b.at);
}
