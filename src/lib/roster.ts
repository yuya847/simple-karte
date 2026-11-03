// 勤務表と様式9（看護部）: the 看護師長 enters a month's shifts for the FICTIONAL 5階東 nurses, and code counts
// each nurse's night hours and checks the month against the 施設基準 of 急性期一般入院料４. People make the
// roster; code only counts and checks (no roster is made by AI, and there is no "make it for me" button).
//
// Rules, as read on 2026-11-04 (令和8年度改定):
// - 告示「基本診療料の施設基準等」（本則は令和8年厚生労働省告示第70号で改められたもの）
//   第五 一 (6)  夜勤を行う看護職員の一人当たりの月平均夜勤時間数が72時間以下
//   第五 一 (7)  急性期一般入院基本料の病棟の夜勤は、看護師1を含む2以上の数の看護職員が行う
//   第五 二 (1) ロ ① 1  看護職員は常時、入院患者の数が10（急性期一般入院料１は7）又はその端数を増すごとに1以上
//   第五 二 (1) ロ ① 2  看護職員の最小必要数の7割以上が看護師
// - 通知「基本診療料の施設基準等及びその届出に関する手続きの取扱いについて」（令和8年3月5日 保医発0305第7号）
//   別添2 第2 4 (2)イ  1勤務帯8時間・1日3勤務帯を標準として、月平均1日当たりで満たす
//   別添2 第2 4 (3)ア  夜勤時間帯 = 病院が定める、午後10時〜翌午前5時を含む連続する16時間
//   別添2 第2 4 (3)オ  月平均夜勤時間数 = 延夜勤時間数 ÷ 夜勤時間帯に従事した実人員数（72時間以下）
//   別添2 第2 4 (3)カ  (イ) 夜勤専従者は含めない (ハ) 月の夜勤時間数が16時間未満の者は含めない
//                      （短時間正職員は12時間以上を含める） (ホ) 申し送りの時間は除いてもよい（月単位で選ぶ）
//   別添2 第2 4 (4)イ  1日に勤務する数は24時間の範囲で傾斜配置できる
//   別添6 別紙5       様式9「3．」の算出方法と端数（①小数第1位までに切り上げ、②⑥小数第2位以下切り捨て）
//   別添7 様式9       記載上の注意 ※4〜※7（夜勤の有無・夜勤従事者数・日付別の時間・含めない者の時間）

import { SHIFTS } from "./worksheet";
import { minutesOf } from "./dates";

export type ShiftCode = "日" | "夜" | "休" | "有" | "";

export const SHIFT_INFO: Record<Exclude<ShiftCode, "">, { label: string; from?: string; to?: string; nextDay?: boolean }> = {
  日: { label: "日勤", from: SHIFTS.day.from, to: SHIFTS.day.to },
  夜: { label: "夜勤", from: SHIFTS.night.from, to: SHIFTS.night.to, nextDay: true },
  休: { label: "休み" },
  有: { label: "年休" },
};

export interface RosterNurse {
  id: string;
  name: string;
  kind: "看護師" | "准看護師";
  /** 夜勤専従者 (not counted in the 月平均夜勤時間数). */
  nightOnly?: boolean;
  /** 短時間正職員: the 16-hour line is 12 hours. */
  shortTime?: boolean;
  /** 1年目 (the fictional hospital's rule: no night of only 1年目). */
  newcomer?: boolean;
  head?: boolean;
}

export interface RosterMonth {
  y: number;
  m: number;
  /** By nurse. Index 0 is the last day of the month before (its night runs into day 1); 1..days are the month. */
  shifts: Record<string, ShiftCode[]>;
  confirmed?: { by: string; at: string };
}

export interface RosterBook {
  nurses: RosterNurse[];
  months: Record<string, RosterMonth>;
  /** ① 1日平均入院患者数 [A] by month (直近1年の延入院患者数 ÷ 延日数; a FICTIONAL figure here). */
  census: Record<string, number>;
  /** Pairs not to be on the same night (the fictional hospital's rule, registered by the 看護師長). */
  ngPairs: [string, string][];
}

/** The 届出 of the ward: 急性期一般入院料４ (看護職員 10対1). */
export const WARD_BASE = { name: "急性期一般入院料４", ratio: 10, nurseShare: 0.7, maxAvgNight: 72, minNight: 2, nightLine: 16, nightLineShort: 12 } as const;

/** 夜勤時間帯 of the FICTIONAL hospital (16 hours, 22:00–05:00 inside). */
export const NIGHT_BAND = { from: "16:30", to: "08:30" } as const;

export const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
export const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** Day of the week (0 = 日曜) of day `d` of the month; d = 0 is the last day of the month before. */
export const dow = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

/** 別添2 第2 4 (3)ア: 16 consecutive hours that include 22:00 to 05:00. */
export function nightBandValid(from: string, to: string): boolean {
  const f = minutesOf(from);
  const t = minutesOf(to) + (minutesOf(to) <= f ? 1440 : 0);
  return t - f === 16 * 60 && f <= 22 * 60 && t >= 1440 + 5 * 60;
}

// ---------------------------------------------------------------------------
// Hours, in minutes from 00:00 of day 1 of the month
// ---------------------------------------------------------------------------

type Span = [number, number];
const overlap = ([a, b]: Span, [c, d]: Span) => Math.max(0, Math.min(b, d) - Math.max(a, c));

/** The time on the ward of the shift on day index i (0 = the day before day 1). */
function shiftSpan(code: ShiftCode, i: number): Span | null {
  if (code !== "日" && code !== "夜") return null;
  const s = SHIFT_INFO[code];
  const base = (i - 1) * 1440;
  return [base + minutesOf(s.from!), base + (s.nextDay ? 1440 : 0) + minutesOf(s.to!)];
}

/** Minutes of the 夜勤時間帯 inside a span. */
function nightMinutes(span: Span): number {
  const f = minutesOf(NIGHT_BAND.from);
  const t = minutesOf(NIGHT_BAND.to) + (minutesOf(NIGHT_BAND.to) <= f ? 1440 : 0);
  let sum = 0;
  for (let j = Math.floor(span[0] / 1440) - 1; j <= Math.floor(span[1] / 1440); j++) sum += overlap(span, [j * 1440 + f, j * 1440 + t]);
  return sum;
}

export interface NurseHours {
  nurse: RosterNurse;
  /** 夜勤 that start in this month. */
  nights: number;
  /** 様式9 上段: hours on the ward outside the 夜勤時間帯 (日勤帯). */
  dayHours: number;
  /** 様式9 中段: hours on the ward in the 夜勤時間帯. */
  nightHours: number;
  /** By date (1..days): 日勤帯 and 夜勤時間帯 hours. */
  byDate: { day: number; dayHours: number; nightHours: number }[];
  /** 様式9 夜勤の有無 (※4). */
  night: "有" | "無" | "夜専";
  /** 様式9 夜勤従事者数 (※5): 1 for 有. (No one here works off the ward at night.) */
  counted: number;
  /** Why the nurse is left out of the 月平均夜勤時間数, if so. */
  excluded: string | null;
}

export function nurseHours(nurse: RosterNurse, codes: ShiftCode[], days: number): NurseHours {
  const byDate = Array.from({ length: days }, (_, k) => ({ day: k + 1, dayHours: 0, nightHours: 0 }));
  let nights = 0;
  for (let i = 0; i < codes.length && i <= days; i++) {
    const span = shiftSpan(codes[i], i);
    if (!span) continue;
    if (codes[i] === "夜" && i >= 1) nights++;
    for (let k = 1; k <= days; k++) {
      const inDate = overlap(span, [(k - 1) * 1440, k * 1440]);
      if (!inDate) continue;
      const n = nightMinutes([Math.max(span[0], (k - 1) * 1440), Math.min(span[1], k * 1440)]);
      byDate[k - 1].nightHours += n / 60;
      byDate[k - 1].dayHours += (inDate - n) / 60;
    }
  }
  const dayHours = byDate.reduce((s, x) => s + x.dayHours, 0);
  const nightHours = byDate.reduce((s, x) => s + x.nightHours, 0);
  const line = nurse.shortTime ? WARD_BASE.nightLineShort : WARD_BASE.nightLine;
  const night = nurse.nightOnly ? "夜専" : nightHours >= line ? "有" : "無";
  const excluded = nurse.nightOnly ? "夜勤専従者（別添2 第2 4 (3)カ(イ)）" : night === "無" ? `月の夜勤時間が${line}時間未満（別添2 第2 4 (3)カ(ハ)）` : null;
  return { nurse, nights, dayHours, nightHours, byDate, night, counted: night === "有" ? 1 : 0, excluded };
}

// ---------------------------------------------------------------------------
// 様式9「3．入院患者の数及び看護要員の数」
// ---------------------------------------------------------------------------

const EPS = 1e-9;
/** 小数第1位までに切り上げ (別紙5 ①：12.34 → 12.4). */
export const ceil1 = (x: number) => Math.ceil(x * 10 - EPS) / 10;
/** 小数第2位以下切り捨て (別紙5 ②⑥：12.34 → 12.3). */
export const floor1 = (x: number) => Math.floor(x * 10 + EPS) / 10;

export interface Form9 {
  days: number;
  /** ① 1日平均入院患者数. */
  A: number;
  /** 1日看護職員配置数（必要数）= (A ÷ 10) × 3. */
  required: number;
  /** 月延べ勤務時間数（看護職員、上段と中段の計）. */
  C: number;
  /** ② 月平均1日当たり看護職員配置数 = C ÷ (日数 × 8). */
  M: number;
  staffOk: boolean;
  /** Of C, the hours of 看護師. */
  cNurse: number;
  /** ③ 看護師の比率 = (看護師の時間 ÷ (日数 × 8)) ÷ 必要数. */
  nurseShare: number | null;
  shareOk: boolean;
  /** 夜勤従事職員数の計, 月延べ夜勤時間数 (all), (含めない者の分). */
  B: number;
  D: number;
  E: number;
  /** ⑥ 月平均夜勤時間数 = (D − E) ÷ B. */
  avgNight: number | null;
  nightOk: boolean;
  rows: NurseHours[];
}

export function form9(nurses: RosterNurse[], month: RosterMonth, census: number): Form9 {
  const days = daysIn(month.y, month.m);
  const rows = nurses.map((n) => nurseHours(n, month.shifts[n.id] ?? [], days));
  const A = ceil1(census);
  const required = ceil1((A / WARD_BASE.ratio) * 3);
  const C = rows.reduce((s, r) => s + r.dayHours + r.nightHours, 0);
  const M = floor1(C / (days * 8));
  const cNurse = rows.filter((r) => r.nurse.kind === "看護師").reduce((s, r) => s + r.dayHours + r.nightHours, 0);
  const nurseShare = required > 0 ? cNurse / (days * 8) / required : null;
  const B = rows.reduce((s, r) => s + r.counted, 0);
  const D = rows.reduce((s, r) => s + r.nightHours, 0);
  const E = rows.filter((r) => r.excluded).reduce((s, r) => s + r.nightHours, 0);
  const avgNight = B > 0 ? floor1((D - E) / B) : null;
  return {
    days,
    A,
    required,
    C,
    M,
    staffOk: required > 0 && M >= required,
    cNurse,
    nurseShare,
    shareOk: nurseShare !== null && nurseShare >= WARD_BASE.nurseShare - EPS,
    B,
    D,
    E,
    avgNight,
    nightOk: avgNight !== null && avgNight <= WARD_BASE.maxAvgNight,
    rows,
  };
}

// ---------------------------------------------------------------------------
// Checks, day by day
// ---------------------------------------------------------------------------

export interface RosterIssue {
  day: number;
  /** 基準 = 施設基準, 重なり = the shifts overlap in time, 院内 = the fictional hospital's rule. */
  kind: "基準" | "重なり" | "院内";
  text: string;
  basis: string;
  nurseIds: string[];
}

/** The nurses on the night that starts on day d. */
export const nightCrew = (nurses: RosterNurse[], month: RosterMonth, d: number) => nurses.filter((n) => month.shifts[n.id]?.[d] === "夜");
export const dayCrew = (nurses: RosterNurse[], month: RosterMonth, d: number) => nurses.filter((n) => month.shifts[n.id]?.[d] === "日");

export function rosterIssues(nurses: RosterNurse[], month: RosterMonth, ngPairs: [string, string][]): RosterIssue[] {
  const days = daysIn(month.y, month.m);
  const name = (id: string) => nurses.find((n) => n.id === id)?.name ?? id;
  const out: RosterIssue[] = [];
  for (let d = 1; d <= days; d++) {
    const crew = nightCrew(nurses, month, d);
    const ids = crew.map((n) => n.id);
    if (crew.length < WARD_BASE.minNight) {
      out.push({ day: d, kind: "基準", text: `夜勤が${crew.length}人です（看護職員${WARD_BASE.minNight}人以上）。`, basis: "告示 第五 一 (7)、第五 二 (1) ロ ① 1、通知 別添2 第2 4 (3)イ(ロ)", nurseIds: ids });
    }
    if (crew.length > 0 && !crew.some((n) => n.kind === "看護師")) {
      out.push({ day: d, kind: "基準", text: "夜勤に看護師がいません（看護師1人を含む）。", basis: "告示 第五 一 (7)", nurseIds: ids });
    }
    if (crew.length > 0 && crew.every((n) => n.newcomer)) {
      out.push({ day: d, kind: "院内", text: `夜勤が1年目だけです（${crew.map((n) => n.name).join("・")}）。`, basis: "架空の病院の取り決め：1年目だけの夜勤にしない", nurseIds: ids });
    }
    for (const [a, b] of ngPairs) {
      if (ids.includes(a) && ids.includes(b)) out.push({ day: d, kind: "院内", text: `${name(a)}と${name(b)}は、同じ夜勤に入れない組み合わせとして登録されています。`, basis: "架空の病院の取り決め：看護師長が登録した組み合わせ", nurseIds: [a, b] });
    }
    for (const n of nurses) {
      const prev = month.shifts[n.id]?.[d - 1];
      const cur = month.shifts[n.id]?.[d];
      if (prev !== "夜") continue;
      if (cur === "日") out.push({ day: d, kind: "重なり", text: `${n.name}：夜勤明け（〜${SHIFTS.night.to}）の日に日勤（${SHIFTS.day.from}〜）が入っています。`, basis: `この病院の勤務時間（日勤 ${SHIFTS.day.from}〜${SHIFTS.day.to}、夜勤 ${SHIFTS.night.from}〜翌${SHIFTS.night.to}）`, nurseIds: [n.id] });
      if (cur === "夜") out.push({ day: d, kind: "院内", text: `${n.name}：夜勤明けの日にまた夜勤です。`, basis: "架空の病院の取り決め：夜勤明けの日は勤務を入れない", nurseIds: [n.id] });
    }
  }
  return out;
}

/** Cells not filled in yet (day 1..days). */
export const blanks = (nurses: RosterNurse[], month: RosterMonth) => {
  const days = daysIn(month.y, month.m);
  return nurses.reduce((s, n) => s + Array.from({ length: days }, (_, k) => month.shifts[n.id]?.[k + 1] ?? "").filter((c) => c === "").length, 0);
};

/** On-ward hours of all nurses on date d, ÷ 8 (for reference: the rule is the month's average, 別添2 第2 4 (2)イ・(4)イ). */
export const dayUnits = (f: Form9, d: number) => f.rows.reduce((s, r) => s + r.byDate[d - 1].dayHours + r.byDate[d - 1].nightHours, 0) / 8;

/** The cell after a night shows 明 (the night runs to 09:00) when it is a day off. */
export const shownCode = (codes: ShiftCode[], i: number): string => (codes[i] === "休" && codes[i - 1] === "夜" ? "明" : codes[i] || "");

// ---------------------------------------------------------------------------
// FICTIONAL staff of 5階東 and a draft for the month (demo data, not a feature: the 看護師長 edits it).
// ---------------------------------------------------------------------------

export const WARD_NURSES: RosterNurse[] = [
  { id: "n-komatsu", name: "看護師長 小松", kind: "看護師", head: true },
  { id: "n-tanaka", name: "看護師 田中", kind: "看護師" },
  { id: "n-watanabe", name: "看護師 渡辺", kind: "看護師" },
  { id: "n-sato", name: "看護師 佐藤", kind: "看護師" },
  { id: "n-sasaki", name: "看護師 佐々木", kind: "看護師" },
  { id: "n-takahashi", name: "看護師 高橋", kind: "看護師" },
  { id: "n-ito", name: "看護師 伊藤", kind: "看護師" },
  { id: "n-maeda", name: "看護師 前田", kind: "看護師" },
  { id: "n-fujita", name: "看護師 藤田", kind: "看護師" },
  { id: "n-okada", name: "看護師 岡田", kind: "看護師" },
  { id: "n-goto", name: "看護師 後藤", kind: "看護師" },
  { id: "n-inoue", name: "准看護師 井上", kind: "准看護師" },
  { id: "n-ogawa", name: "看護師 小川", kind: "看護師", newcomer: true },
  { id: "n-kimura", name: "看護師 木村", kind: "看護師", newcomer: true },
  { id: "n-shimizu", name: "看護師 清水", kind: "看護師", newcomer: true },
  { id: "n-nishimura", name: "看護師 西村", kind: "看護師", nightOnly: true },
];

/** The FICTIONAL 1日平均入院患者数 of 5階東 (34床). */
export const FICTIONAL_CENSUS = 29;

/**
 * A FICTIONAL draft for a month, as a 看護師長 might have begun it: two on each night (the 夜勤専従 every
 * 4th night), 明 then a day off after a night, 日勤 spread over the month. It keeps one night of only 1年目 on
 * purpose, so that the checks have something to show. Built from fixed rules (no AI, no optimisation).
 */
export function draftMonth(nurses: RosterNurse[], y: number, m: number): RosterMonth {
  const days = daysIn(y, m);
  const s: Record<string, ShiftCode[]> = Object.fromEntries(nurses.map((n) => [n.id, Array<ShiftCode>(days + 2).fill("")]));
  const count: Record<string, number> = {};
  const last: Record<string, number> = {};
  const rotating = nurses.filter((n) => !n.nightOnly && !n.head);
  // Ties go round with the day, so that the same two do not always meet.
  const turn = (n: RosterNurse, d: number) => (rotating.indexOf(n) * 5 + d) % rotating.length;
  const met: Record<string, number> = {};
  let demoFresh = false;
  const pairKey = (a: string, b: string) => [a, b].sort().join("|");
  for (let d = 0; d <= days; d++) {
    const crew: RosterNurse[] = nurses.filter((n) => n.nightOnly && d % 4 === 1);
    while (crew.length < 2) {
      const free = rotating.filter((n) => !crew.includes(n) && s[n.id][d] === "" && (d < 2 || s[n.id][d - 2] !== "夜"));
      if (!free.length) break;
      // Fewest nights first, then someone who has met the other one least, then the longest since a night.
      const seen = (n: RosterNurse) => crew.reduce((t, c) => t + (met[pairKey(n.id, c.id)] ?? 0), 0);
      free.sort((a, b) => (count[a.id] ?? 0) - (count[b.id] ?? 0) || seen(a) - seen(b) || (last[a.id] ?? -9) - (last[b.id] ?? -9) || turn(a, d) - turn(b, d));
      // Once, from the 10th: a second 1年目 joins a 1年目 (kept in the draft for the checks to show).
      const fresh = !demoFresh && d >= 10 && crew.length === 1 && crew[0].newcomer ? free.find((n) => n.newcomer) : undefined;
      if (fresh) {
        crew.push(fresh);
        demoFresh = true;
        continue;
      }
      crew.push(free.find((n) => !(n.newcomer && crew.some((c) => c.newcomer)) && !(n.kind === "准看護師" && crew.some((c) => c.kind === "准看護師"))) ?? free[0]);
    }
    for (const n of crew) {
      s[n.id][d] = "夜";
      s[n.id][d + 1] = "休";
      count[n.id] = (count[n.id] ?? 0) + 1;
      last[n.id] = d;
    }
    if (crew.length === 2) met[pairKey(crew[0].id, crew[1].id)] = (met[pairKey(crew[0].id, crew[1].id)] ?? 0) + 1;
  }
  // 日勤: about 7 on weekdays (the 看護師長 among them) and 4 at weekends, to those with the most days left
  // of about 20 working days a month (a night counts as two).
  const left: Record<string, number> = Object.fromEntries(rotating.map((n) => [n.id, 20 - 2 * (count[n.id] ?? 0)]));
  for (let d = 0; d <= days; d++) {
    const weekend = dow(y, m, d) === 0 || dow(y, m, d) === 6;
    let want = weekend ? 4 : 7;
    for (const n of nurses.filter((x) => x.head && s[x.id][d] === "")) {
      s[n.id][d] = weekend ? "休" : "日";
      if (!weekend) want--;
    }
    const pick = rotating.filter((n) => s[n.id][d] === "").sort((a, b) => left[b.id] - left[a.id] || turn(a, d) - turn(b, d));
    for (const n of pick.slice(0, Math.max(0, want))) {
      s[n.id][d] = "日";
      left[n.id]--;
    }
    for (const n of nurses) if (s[n.id][d] === "") s[n.id][d] = "休";
  }
  return { y, m, shifts: Object.fromEntries(Object.entries(s).map(([id, c]) => [id, c.slice(0, days + 1)])) };
}

/** An empty month, carrying the last day of the month before (its night runs into day 1). */
export function emptyMonth(nurses: RosterNurse[], y: number, m: number, before?: RosterMonth): RosterMonth {
  const days = daysIn(y, m);
  return {
    y,
    m,
    shifts: Object.fromEntries(nurses.map((n) => [n.id, [(before?.shifts[n.id]?.at(-1) ?? "") as ShiftCode, ...Array<ShiftCode>(days).fill("")]])),
  };
}

/** The book at the start of the demo: this month's draft, and one NG pair that the draft breaks once. */
export function initialRosterBook(y: number, m: number): RosterBook {
  const month = draftMonth(WARD_NURSES, y, m);
  const days = daysIn(y, m);
  // Two 看護師 (not 1年目) who share exactly one night of the month, from the 15th on.
  const pairs = new Map<string, number[]>();
  for (let d = 1; d <= days; d++) {
    const crew = nightCrew(WARD_NURSES, month, d).filter((n) => !n.newcomer && !n.nightOnly && n.kind === "看護師");
    if (crew.length === 2) pairs.set(`${crew[0].id}|${crew[1].id}`, [...(pairs.get(`${crew[0].id}|${crew[1].id}`) ?? []), d]);
  }
  const hit = [...pairs.entries()].find(([, ds]) => ds.length === 1 && ds[0] >= 15) ?? [...pairs.entries()][0];
  const pair = hit ? (hit[0].split("|") as [string, string]) : null;
  return { nurses: WARD_NURSES, months: { [monthKey(y, m)]: month }, census: { [monthKey(y, m)]: FICTIONAL_CENSUS }, ngPairs: pair ? [pair] : [] };
}

/** The month after (y, m). */
export const nextMonth = (y: number, m: number) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 });
