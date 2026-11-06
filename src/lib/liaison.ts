// 地域医療連携 of the FICTIONAL hospital: the 紹介・逆紹介の台帳 (which clinic sent whom, when they came,
// the 返書 and its deadline), the 連携先の医療機関マスタ, and the 紹介割合・逆紹介割合 counted by code with the
// formula of the 留意事項通知 (A000 初診料 (7)). All clinics, hospitals and patients are fictional. The
// counts before today are a fictional record (the same calendar day always gives the same rows).

import { addDays, weekday, type CalendarDate } from "./dates";
import { makeRng, seedFrom, type Rng } from "./pacs/random";
import type { DayOffset } from "./types";

// ---------------------------------------------------------------------------
// 連携先の医療機関マスタ（架空）
// ---------------------------------------------------------------------------

export interface Facility {
  id: string;
  name: string;
  kind: "診療所" | "病院" | "介護施設";
  /** 診療科・病棟の種類 (as the 連携室 writes it). */
  what: string;
  town: string;
  tel: string;
  fax: string;
  /**
   * 当院と「特別の関係」にある・開設者と直接関係のある機関: 紹介割合・逆紹介割合の紹介患者数と逆紹介患者数に
   * 数えない（留意事項通知 A000 (7) ウ・エ）. Which ones are is the hospital's own fact (架空).
   */
  related?: boolean;
}

/** 架空の医療機関. Phone numbers are 000 numbers (not real). */
export const FACILITIES: Facility[] = [
  { id: "f01", name: "〇〇内科クリニック（架空）", kind: "診療所", what: "内科", town: "架空市中央", tel: "045-000-1101", fax: "045-000-1102" },
  { id: "f02", name: "あおい台内科医院（架空）", kind: "診療所", what: "内科・循環器内科", town: "架空市あおい台", tel: "045-000-1201", fax: "045-000-1202" },
  { id: "f03", name: "みなと整形外科クリニック（架空）", kind: "診療所", what: "整形外科・リハビリテーション科", town: "架空市港町", tel: "045-000-1301", fax: "045-000-1302" },
  { id: "f04", name: "ひかり消化器内科（架空）", kind: "診療所", what: "消化器内科・内視鏡", town: "架空市光町", tel: "045-000-1401", fax: "045-000-1402" },
  { id: "f05", name: "つばさ呼吸器クリニック（架空）", kind: "診療所", what: "呼吸器内科", town: "架空市翼町", tel: "045-000-1501", fax: "045-000-1502" },
  { id: "f06", name: "ゆりのき在宅クリニック（架空）", kind: "診療所", what: "在宅医療（訪問診療）", town: "架空市百合木", tel: "045-000-1601", fax: "045-000-1602" },
  { id: "f07", name: "まちなか眼科・皮膚科（架空）", kind: "診療所", what: "眼科・皮膚科", town: "架空市本町", tel: "045-000-1701", fax: "045-000-1702" },
  { id: "f08", name: "架空総合病院 附属診療所（架空）", kind: "診療所", what: "内科（当院と同じ開設者）", town: "架空市中央", tel: "045-000-1801", fax: "045-000-1802", related: true },
  { id: "f09", name: "架空大学病院（架空）", kind: "病院", what: "特定機能病院", town: "架空市大学町", tel: "045-000-1901", fax: "045-000-1902" },
  { id: "f10", name: "みどり台リハビリテーション病院（架空）", kind: "病院", what: "回復期リハビリテーション病棟", town: "架空市みどり台", tel: "045-000-2001", fax: "045-000-2002" },
  { id: "f11", name: "さくら坂病院（架空）", kind: "病院", what: "医療療養病棟", town: "架空市桜坂", tel: "045-000-2101", fax: "045-000-2102" },
  { id: "f12", name: "かえで地域包括ケア病院（架空）", kind: "病院", what: "地域包括ケア病棟", town: "架空市楓町", tel: "045-000-2201", fax: "045-000-2202" },
  { id: "f13", name: "介護老人保健施設 ひだまり（架空）", kind: "介護施設", what: "介護老人保健施設", town: "架空市日溜", tel: "045-000-2301", fax: "045-000-2302" },
];

export const facilityById = (id: string | null | undefined, list: Facility[] = FACILITIES): Facility | undefined => (id ? list.find((f) => f.id === id) : undefined);

/** The master entry whose name is written the same (spaces and （架空） ignored), for a letter written by hand. */
export function facilityByName(text: string, list: Facility[] = FACILITIES): Facility | undefined {
  const norm = (s: string) => s.replace(/[\s　]/g, "").replace(/（架空）/g, "");
  const t = norm(text);
  if (!t) return undefined;
  return list.find((f) => norm(f.name) === t) ?? list.find((f) => t.includes(norm(f.name)));
}

// ---------------------------------------------------------------------------
// 紹介・逆紹介の台帳
// ---------------------------------------------------------------------------

/** 紹介 = 他の医療機関から当院へ, 逆紹介 = 当院から他の医療機関へ. */
export type Direction = "紹介" | "逆紹介";

export type ReferralSource = "記録（架空）" | "外来の受付" | "救急外来" | "退院サマリの紹介状" | "台帳に記録";

export interface Referral {
  id: string;
  direction: Direction;
  /** null: the name on the letter is not in the master (the 連携室 chooses). */
  facilityId: string | null;
  /** The name as written on the letter, when it is not in the master. */
  facilityText?: string;
  patient: { name: string; kana?: string; id?: string };
  department: string;
  /** 当院の担当医. */
  doctor: string;
  /** 紹介状（診療情報提供書）の日付. */
  letterDay: DayOffset;
  /** 紹介: the day the patient was seen here; null = not yet (予約). 逆紹介: the day of the letter. */
  visitDay: DayOffset | null;
  /** 紹介: 医学的に初診といわれる診療行為があった (紹介患者数に数えるのは初診だけ). */
  firstVisit: boolean;
  /** 救急自動車で搬送された. */
  ambulance: boolean;
  /** 情報通信機器を用いた診療のみ (紹介患者数・逆紹介患者数に数えない). */
  onlineOnly?: boolean;
  reason: string;
  source: ReferralSource;
  by?: string;
}

/** 当院からの返書（紹介元への受診の報告）を送ったこと, or 逆紹介先からの返書を受け取ったこと. */
export interface ReplyRecord {
  day: DayOffset;
  time: string;
  by: string;
  how: ReplyHow;
}
export type ReplyHow = "郵送" | "FAX" | "患者に手渡し" | "電子的な送付";
export const REPLY_HOWS: ReplyHow[] = ["郵送", "FAX", "患者に手渡し", "電子的な送付"];

/** What the 連携室 keeps (in this browser): entries it added, the 返書 sent and received, facilities chosen. */
export interface LiaisonBook {
  added: Referral[];
  /** 紹介 → 当院から紹介元へ送った返書. */
  replies: Record<string, ReplyRecord>;
  /** 逆紹介 → 紹介先から受け取った返書. */
  received: Record<string, ReplyRecord>;
  /** Entries made from another record (外来・救急・紹介状) whose facility the 連携室 chose. */
  facility: Record<string, string>;
}

export const EMPTY_LIAISON: LiaisonBook = { added: [], replies: {}, received: {}, facility: {} };

/**
 * 架空の病院の取り決め: 紹介を受けた患者の初回の返書（受診の報告）は、受診日から14日以内に送る.
 * The 通知 sets no deadline for this; a hospital sets its own.
 */
export const REPLY_DAYS = 14;
export const REPLY_RULE = `紹介を受けた患者の初回の返書（受診の報告）は、受診日から${REPLY_DAYS}日以内に送る`;

export type ReplyState = "受診待ち" | "返書待ち" | "期限切れ" | "返書済み" | "先方の返書待ち" | "先方の返書あり";

export interface LedgerRow {
  ref: Referral;
  facility?: Facility;
  state: ReplyState;
  /** 紹介: the 返書's deadline (day offset); null before the visit. */
  due: DayOffset | null;
  /** Days left until the deadline (negative = overdue), or days waited for the other side's 返書. */
  days: number | null;
  reply?: ReplyRecord;
}

export function ledgerRow(ref: Referral, book: LiaisonBook, facilities: Facility[] = FACILITIES): LedgerRow {
  const facility = facilityById(book.facility[ref.id] ?? ref.facilityId, facilities);
  if (ref.direction === "逆紹介") {
    const reply = book.received[ref.id];
    return { ref, facility, state: reply ? "先方の返書あり" : "先方の返書待ち", due: null, days: reply ? null : -(ref.visitDay ?? ref.letterDay), reply };
  }
  const reply = book.replies[ref.id];
  if (ref.visitDay === null) return { ref, facility, state: "受診待ち", due: null, days: null };
  const due = ref.visitDay + REPLY_DAYS;
  if (reply) return { ref, facility, state: "返書済み", due, days: null, reply };
  return { ref, facility, state: due < 0 ? "期限切れ" : "返書待ち", due, days: due };
}

/** 未返書の一覧: 紹介 seen here with no 返書 yet, the overdue first, then by deadline. */
export function unanswered(rows: LedgerRow[]): LedgerRow[] {
  return rows.filter((r) => r.state === "期限切れ" || r.state === "返書待ち").sort((a, b) => (a.due ?? 0) - (b.due ?? 0) || a.ref.id.localeCompare(b.ref.id));
}

// ---------------------------------------------------------------------------
// Entries that come from the other records of today
// ---------------------------------------------------------------------------

export interface OpdLike {
  id: string;
  name: string;
  kana: string;
  department: string;
  doctor: string;
  kind: "初診" | "再診";
  arrived?: string;
  referral?: string;
  referralFrom?: string;
  reason: string;
}

/** 外来: a patient who brought a 紹介状 (seen today once they arrived; 予約 until then). */
export function fromOpd(list: OpdLike[]): Referral[] {
  return list
    .filter((p) => p.referral)
    .map((p) => {
      const named = p.referralFrom ? facilityById(p.referralFrom) : facilityByName(p.referral!.split("より")[0]);
      return {
        id: `opd:${p.id}`,
        direction: "紹介",
        facilityId: named?.id ?? null,
        ...(named ? {} : { facilityText: p.referral!.split("より")[0] }),
        patient: { name: p.name, kana: p.kana, id: p.id },
        department: p.department,
        doctor: p.doctor,
        letterDay: 0,
        visitDay: p.arrived ? 0 : null,
        firstVisit: p.kind === "初診",
        ambulance: false,
        reason: p.reason,
        source: "外来の受付",
      };
    });
}

export interface ErLike {
  id: string;
  name: string;
  kana: string;
  arrival: "救急車" | "独歩" | "紹介";
  status: string;
  complaint: string;
}

/** 救急外来: a patient who came with a 紹介 (the clinic is chosen by the 連携室). */
export function fromEr(list: ErLike[], doctor: string): Referral[] {
  return list
    .filter((p) => p.arrival === "紹介" && p.status !== "搬送中")
    .map((p) => ({
      id: `er:${p.id}`,
      direction: "紹介",
      facilityId: null,
      facilityText: "（救急外来の受付で紹介と記録。紹介元を選ぶ）",
      patient: { name: p.name, kana: p.kana, id: p.id },
      department: "救急外来",
      doctor,
      letterDay: 0,
      visitDay: 0,
      firstVisit: true,
      ambulance: false,
      reason: p.complaint,
      source: "救急外来",
    }));
}

export interface LetterLike {
  patientId: string;
  name: string;
  kana: string;
  department: string;
  doctor: string;
  to: string;
  purpose: string;
  issuedDay: DayOffset;
}

/** 退院サマリで発行した紹介状 = 逆紹介 (the destination matched to the master by its name). */
export function fromLetters(list: LetterLike[]): Referral[] {
  return list.map((l) => {
    const f = facilityByName(l.to);
    return {
      id: `letter:${l.patientId}`,
      direction: "逆紹介",
      facilityId: f?.id ?? null,
      ...(f ? {} : { facilityText: l.to || "（紹介先が書かれていない）" }),
      patient: { name: l.name, kana: l.kana, id: l.patientId },
      department: l.department,
      doctor: l.doctor,
      letterDay: l.issuedDay,
      visitDay: l.issuedDay,
      firstVisit: false,
      ambulance: false,
      reason: l.purpose,
      source: "退院サマリの紹介状",
    };
  });
}

// ---------------------------------------------------------------------------
// 紹介割合・逆紹介割合（留意事項通知 A000 初診料 (7)）
// ---------------------------------------------------------------------------

export const REFERRAL_RATE_SOURCES = [
  {
    label: "厚生労働省「診療報酬の算定方法の一部改正に伴う実施上の留意事項について」（令和8年3月5日 保医発0305第6号）別添1 A000 初診料 (7)〜(9)、A002 外来診療料 (3)(5)(6)",
    url: "https://www.mhlw.go.jp/content/12400000/001757385.pdf",
  },
  { label: "令和8年度診療報酬改定について（厚生労働省。上の通知の掲載ページ）", url: "https://www.mhlw.go.jp/stf/newpage_67729.html" },
];

/** The formula as the 通知 writes it. */
export const RATE_FORMULA = {
  shokai: "紹介割合（％）＝（紹介患者数＋救急患者数）÷ 初診の患者数 × 100",
  gyaku: "逆紹介割合（‰）＝ 逆紹介患者数 ÷（初診の患者数＋再診の患者数）× 1,000",
};

/** What each number is (the 通知's ア〜オ, shortened; the 通知 is the authority). */
export const RATE_TERMS: { term: string; text: string }[] = [
  { term: "初診の患者数", text: "医学的に初診といわれる診療行為があった患者の数。救急自動車で搬送された患者（地域医療支援病院が医療計画の救急医療事業を行う場合は、休日・夜間に受診した救急患者も）を除く。" },
  { term: "再診の患者数", text: "初診以外の患者の数。救急自動車で搬送された患者、B005-11 遠隔連携診療料・B011 連携強化診療情報提供料を算定している患者、転帰が軽快で退院後の初回外来時に次回以降の通院が要らないとされた患者などを除く。" },
  { term: "紹介患者数", text: "他の保険医療機関（特別の関係にあるものを除く）から診療情報提供書を受け、当院で医学的に初診といわれる診療行為（情報通信機器を用いた診療のみを除く）があった患者の数。" },
  { term: "逆紹介患者数", text: "診療（情報通信機器を用いた診療のみを除く）に基づき、患者に説明して同意を得て、診療状況を示す文書を添えて他の保険医療機関に紹介した患者の数（開設者と直接関係のある他の機関に紹介した患者を除き、B005-11・B011 を算定している患者を含む）。" },
  { term: "救急患者数", text: "地方公共団体又は医療機関に所属する救急自動車で搬送された初診の患者の数（搬送の時間を問わない）。" },
];

/** The 通知's thresholds (令和8年度). Below either one, the hospital is 「紹介割合等が低い保険医療機関」. */
export const RATE_THRESHOLDS = [
  { group: "注2：特定機能病院、地域医療支援病院（一般病床200床未満を除く）、紹介受診重点医療機関（一般病床200床未満を除く）", shokai: 50, gyaku: 50 },
  { group: "注3：許可病床400床以上の病院（上の病院と一般病床200床未満の病院を除く）", shokai: 40, gyaku: 40 },
];

/** 実績の期間 and the 報告 (A000 (7)(8)). */
export const RATE_PERIOD_NOTE =
  "通知の実績の期間は、報告年度の前年度1年間（基準に満たなかった病院は報告年度の連続する6か月間、新たに対象となる病院は届出前3か月間）。対象の病院は毎年10月に別紙様式28で地方厚生（支）局長へ報告する。";

/** One day of one department's outpatients (counts, already as the 通知 counts them). */
export interface VisitDay {
  day: DayOffset;
  department: string;
  /** 初診の患者数に入る患者（救急自動車で搬送された患者を除く）. */
  first: number;
  /** 再診の患者数に入る患者. */
  revisit: number;
  /** 救急自動車で搬送された初診の患者. */
  ambulance: number;
}

export interface RateCounts {
  first: number;
  revisit: number;
  referred: number;
  ambulance: number;
  reverse: number;
  /** Not counted, with why (so a person sees what was left out). */
  left: { why: string; n: number }[];
  /** 紹介状を持って救急自動車で来た初診の患者: in 紹介患者数 and in 救急患者数 as the 通知's words read. */
  both: number;
}

export interface Period {
  label: string;
  from: DayOffset;
  to: DayOffset;
}

/** Calendar months: this month (to today), and the `back` months before it (whole months). */
export function monthPeriods(today: CalendarDate, back: number): Period[] {
  const out: Period[] = [];
  for (let i = 0; i <= back; i++) {
    const first = new Date(Date.UTC(today.y, today.m - 1 - i, 1));
    const last = new Date(Date.UTC(today.y, today.m - i, 0));
    const base = Date.UTC(today.y, today.m - 1, today.d);
    const from = Math.round((first.getTime() - base) / 86_400_000);
    const to = Math.min(0, Math.round((last.getTime() - base) / 86_400_000));
    out.push({ label: `${first.getUTCFullYear()}年${first.getUTCMonth() + 1}月${i === 0 ? "（今日まで）" : ""}`, from, to });
  }
  return out;
}

const inPeriod = (d: DayOffset | null, p: Period) => d !== null && d >= p.from && d <= p.to;

export function rateCounts(p: Period, visits: VisitDay[], ledger: { ref: Referral; facility?: Facility }[]): RateCounts {
  const v = visits.filter((x) => inPeriod(x.day, p));
  const sum = (k: "first" | "revisit" | "ambulance") => v.reduce((n, x) => n + x[k], 0);
  const left = new Map<string, number>();
  const leave = (why: string) => left.set(why, (left.get(why) ?? 0) + 1);
  let referred = 0;
  let reverse = 0;
  let both = 0;
  for (const { ref, facility } of ledger) {
    if (!inPeriod(ref.visitDay, p)) continue;
    if (ref.direction === "紹介") {
      if (!ref.firstVisit) leave("紹介：初診ではない");
      else if (ref.onlineOnly) leave("紹介：情報通信機器を用いた診療のみ");
      else if (facility?.related) leave("紹介：特別の関係にある医療機関から");
      else if (!facility) leave("紹介：紹介元がマスタで選ばれていない");
      else {
        referred++;
        if (ref.ambulance) both++;
      }
    } else if (ref.onlineOnly) leave("逆紹介：情報通信機器を用いた診療のみ");
    else if (facility?.related) leave("逆紹介：開設者と直接関係のある機関へ");
    else if (!facility) leave("逆紹介：紹介先がマスタで選ばれていない");
    else reverse++;
  }
  return { first: sum("first"), revisit: sum("revisit"), referred, ambulance: sum("ambulance"), reverse, left: [...left].map(([why, n]) => ({ why, n })), both };
}

/** The two rates (rounded to one decimal place for showing); null when the denominator is 0. */
export function referralRates(c: Pick<RateCounts, "first" | "revisit" | "referred" | "ambulance" | "reverse">): { shokai: number | null; gyaku: number | null } {
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    shokai: c.first ? r1(((c.referred + c.ambulance) / c.first) * 100) : null,
    gyaku: c.first + c.revisit ? r1((c.reverse / (c.first + c.revisit)) * 1000) : null,
  };
}

/** Today's outpatients as the 通知 counts them (外来 and 救急外来; 救急外来 has no 初診・再診 in this app, so 初診). */
export function todayVisits(opd: { department: string; kind: "初診" | "再診"; arrived?: string }[], er: { arrival: string; status: string }[]): VisitDay[] {
  const out = new Map<string, VisitDay>();
  const row = (department: string) => out.get(department) ?? out.set(department, { day: 0, department, first: 0, revisit: 0, ambulance: 0 }).get(department)!;
  for (const p of opd) if (p.arrived) row(p.department)[p.kind === "初診" ? "first" : "revisit"]++;
  for (const p of er) {
    if (p.status === "搬送中") continue;
    if (p.arrival === "救急車") row("救急外来").ambulance++;
    else row("救急外来").first++;
  }
  return [...out.values()];
}

// ---------------------------------------------------------------------------
// The fictional record before today (外来の日計と台帳). Seeded by the calendar date.
// ---------------------------------------------------------------------------

/** 外来の診療科 of the fictional hospital, with a day's typical 初診・再診 (架空). */
export const OPD_DEPTS: { name: string; first: number; revisit: number; doctor: string }[] = [
  { name: "総合診療科", first: 7, revisit: 26, doctor: "山本（専攻医）" },
  { name: "循環器内科", first: 3, revisit: 30, doctor: "循環器内科 森（架空）" },
  { name: "消化器内科", first: 4, revisit: 28, doctor: "消化器内科 石川（架空）" },
  { name: "呼吸器内科", first: 3, revisit: 18, doctor: "呼吸器内科 岡田（架空）" },
  { name: "整形外科", first: 5, revisit: 24, doctor: "整形外科 長谷川（架空）" },
];

const SURNAMES = ["佐々木", "山田", "井上", "木村", "林", "清水", "山崎", "森", "阿部", "池田", "橋本", "石川", "前田", "藤原", "後藤", "岡田", "長谷川", "村上", "近藤", "斎藤", "遠藤", "青木", "坂本", "福田", "太田", "西村", "藤井", "岡本", "松田", "中川"];
const GIVEN = ["和夫", "幸子", "博", "節子", "茂", "照子", "隆", "久子", "清", "美智子", "進", "和子", "勇", "洋子", "誠", "恵子", "健一", "京子", "修", "典子", "浩", "由美子", "明", "裕子", "実", "静子"];
const KANA_S: Record<string, string> = { 佐々木: "ササキ", 山田: "ヤマダ", 井上: "イノウエ", 木村: "キムラ", 林: "ハヤシ", 清水: "シミズ", 山崎: "ヤマザキ", 森: "モリ", 阿部: "アベ", 池田: "イケダ", 橋本: "ハシモト", 石川: "イシカワ", 前田: "マエダ", 藤原: "フジワラ", 後藤: "ゴトウ", 岡田: "オカダ", 長谷川: "ハセガワ", 村上: "ムラカミ", 近藤: "コンドウ", 斎藤: "サイトウ", 遠藤: "エンドウ", 青木: "アオキ", 坂本: "サカモト", 福田: "フクダ", 太田: "オオタ", 西村: "ニシムラ", 藤井: "フジイ", 岡本: "オカモト", 松田: "マツダ", 中川: "ナカガワ" };

const pick = <T,>(r: Rng, xs: T[]): T => xs[Math.floor(r() * xs.length)];
/** About `mean` (0 or more), spread a little. */
const around = (r: Rng, mean: number) => Math.max(0, Math.round(mean * (0.6 + r() * 0.8)));

/** Referral reasons by department (架空). */
const REASONS: Record<string, string[]> = {
  総合診療科: ["食欲低下と体重減少の精査", "発熱が続く原因の精査", "貧血の精査", "ふらつき・倦怠感の精査"],
  循環器内科: ["心電図異常の精査", "労作時の胸痛", "心不全の評価", "心房細動の治療の相談"],
  消化器内科: ["便潜血陽性の大腸内視鏡", "肝機能障害の精査", "胃内視鏡の依頼", "腹痛の精査"],
  呼吸器内科: ["胸部X線の異常影", "長引く咳の精査", "COPD の評価", "睡眠時無呼吸の検査"],
  整形外科: ["腰痛としびれ", "膝の痛み（手術の相談）", "骨粗鬆症の評価", "転倒後の手首の痛み"],
};
/** Which (fictional) clinics send patients to which department, and where they go back to. */
const REFERRERS: Record<string, string[]> = {
  総合診療科: ["f01", "f02", "f06", "f07"],
  循環器内科: ["f01", "f02"],
  消化器内科: ["f01", "f04", "f02"],
  呼吸器内科: ["f01", "f05", "f02"],
  整形外科: ["f03", "f01"],
};
const BACK_TO: Record<string, string[]> = {
  総合診療科: ["f01", "f02", "f06", "f11", "f12"],
  循環器内科: ["f02", "f01", "f10"],
  消化器内科: ["f04", "f01", "f12"],
  呼吸器内科: ["f05", "f01", "f06"],
  整形外科: ["f03", "f10", "f12"],
};
const BACK_REASONS = ["症状が落ち着いたため、かかりつけ医での継続をお願い", "退院後の定期の診療をお願い", "訪問診療をお願い", "リハビリの継続をお願い", "内服の調整を続けてお願い"];

export interface LiaisonHistory {
  visits: VisitDay[];
  ledger: Referral[];
  /** 返書 already sent / received before today, by entry id. */
  replies: Record<string, ReplyRecord>;
  received: Record<string, ReplyRecord>;
}

/**
 * The fictional record of the `days` days before today: each weekday's 初診・再診・救急 by department, the
 * 紹介 among the 初診 (about 4 in 10 brought a letter), the 逆紹介, and the 返書 (most sent within the
 * deadline, the latest ones not yet). Saturdays and Sundays: 救急 only.
 */
export function liaisonHistory(today: CalendarDate, days: number): LiaisonHistory {
  const visits: VisitDay[] = [];
  const ledger: Referral[] = [];
  const replies: Record<string, ReplyRecord> = {};
  const received: Record<string, ReplyRecord> = {};
  const byId = (ids: string[]) => ids.map((id) => FACILITIES.find((f) => f.id === id)!);
  for (let day = -days; day < 0; day++) {
    const date = addDays(today, day);
    const iso = `${date.y}-${date.m}-${date.d}`;
    const r = makeRng(seedFrom(`liaison:${iso}`));
    const wd = weekday(date);
    const open = wd !== "土" && wd !== "日";
    visits.push({ day, department: "救急外来", first: around(r, open ? 3 : 4), revisit: 0, ambulance: around(r, 3) });
    if (!open) continue;
    for (const d of OPD_DEPTS) {
      const first = around(r, d.first);
      const revisit = around(r, d.revisit);
      visits.push({ day, department: d.name, first, revisit, ambulance: 0 });
      const referred = Math.min(first, Math.round(first * (0.3 + r() * 0.25)));
      for (let i = 0; i < referred; i++) {
        const id = `h:${iso}:${d.name}:${i}`;
        const s = pick(r, SURNAMES);
        const g = pick(r, GIVEN);
        const f = r() < 0.05 ? FACILITIES.find((x) => x.related)! : pick(r, byId(REFERRERS[d.name]));
        ledger.push({
          id,
          direction: "紹介",
          facilityId: f.id,
          patient: { name: `${s} ${g}`, kana: KANA_S[s] },
          department: d.name,
          doctor: d.doctor,
          letterDay: day - 1 - Math.floor(r() * 7),
          visitDay: day,
          firstVisit: true,
          ambulance: false,
          reason: pick(r, REASONS[d.name]),
          source: "記録（架空）",
        });
        // 返書: most within the deadline; some of the last weeks' not yet.
        const late = r();
        const wait = 2 + Math.floor(r() * 10);
        if (day + wait < 0 && (day < -REPLY_DAYS - 7 ? late < 0.995 : late < 0.6)) replies[id] = { day: day + wait, time: "16:00", by: "連携室（架空）", how: pick(r, ["郵送", "FAX"] as ReplyHow[]) };
      }
      const back = Math.round((first + revisit) * (0.03 + r() * 0.04));
      for (let i = 0; i < back; i++) {
        const id = `hb:${iso}:${d.name}:${i}`;
        const s = pick(r, SURNAMES);
        const g = pick(r, GIVEN);
        const f = r() < 0.04 ? FACILITIES.find((x) => x.related)! : pick(r, byId(BACK_TO[d.name]));
        ledger.push({
          id,
          direction: "逆紹介",
          facilityId: f.id,
          patient: { name: `${s} ${g}`, kana: KANA_S[s] },
          department: d.name,
          doctor: d.doctor,
          letterDay: day,
          visitDay: day,
          firstVisit: false,
          ambulance: false,
          reason: pick(r, BACK_REASONS),
          source: "記録（架空）",
        });
        const wait = 5 + Math.floor(r() * 20);
        if (day + wait < 0 && r() < 0.8) received[id] = { day: day + wait, time: "11:00", by: "連携室（架空）", how: "FAX" };
      }
    }
  }
  return { visits, ledger, replies, received };
}
