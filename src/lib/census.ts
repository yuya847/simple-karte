// 統計・日報 of the FICTIONAL hospital: who was in which ward on which day (the stays), and what is counted
// from them by code — the day's 入院・転入・退院・死亡・転出 and the census, 病床利用率 and 平均在院日数 as
// 厚生労働省「病院報告」defines them, 平均在院日数 as the 入院基本料 施設基準 defines it (別添6 別紙4,
// 直近3か月), and the patients by department.
//
// Today's stays come from the records (the patients with charts, today's admissions, 退院 carried out,
// moves between wards, and the other teams' patients in the beds). Before today the stays are a fictional
// record worked backwards from today's beds (seeded by today's date, so the same day gives the same rows).

import { isoDate, type CalendarDate } from "./dates";
import { csvOf } from "./extract";
import { makeRng, seedFrom, type Rng } from "./pacs/random";
import type { DayOffset } from "./types";
import { floorOf, type BedAssignment, type Floor } from "./ward";

export type InKind = "入院" | "転入";
export type OutKind = "退院" | "死亡" | "転出";

export interface Stay {
  id: string;
  /** One admission (the same across 転棟). */
  admission: string;
  floor: string;
  dept: string;
  in: { day: DayOffset; kind: InKind };
  out?: { day: DayOffset; kind: OutKind };
  /** 短期滞在手術等基本料３ を算定する入院 (告示 別表第二 二十二: 入院した日から5日までは計算の対象としない). */
  shortStay3?: boolean;
  /** From today's records (not the fictional record). */
  live?: boolean;
  name?: string;
}

export const CENSUS_SOURCES = {
  hospitalReport: [
    { label: "厚生労働省「令和7(2025)年 医療施設（動態）調査・病院報告の概況」4 用語の説明（在院患者・新入院患者・退院患者・病床利用率・平均在院日数）", url: "https://www.mhlw.go.jp/toukei/saikin/hw/iryosd/25/dl/11gaikyou07.pdf" },
    { label: "厚生労働省 統計調査「用語の解説」（月間の式・月末病床利用率）", url: "https://www.mhlw.go.jp/toukei/list/dl/12yougo.pdf" },
  ],
  basic: [
    { label: "厚生労働省「基本診療料の施設基準等及びその届出に関する手続きの取扱いについて」（令和8年3月5日 保医発0305第7号）別添2 第2の3、別添6 別紙4「平均在院日数の算定方法」", url: "https://www.mhlw.go.jp/content/12400000/001757361.pdf" },
    { label: "基本診療料の施設基準等（令和8年厚生労働省告示第70号）第五 一 通則(4)、別表第二「平均在院日数の計算対象としない患者」", url: "https://www.mhlw.go.jp/content/12400000/001675854.pdf" },
  ],
};

/** The formulas as the sources write them. */
export const CENSUS_FORMULA = {
  utilization: "病床利用率 ＝ 在院患者延数 ÷（月間日数 × 月末病床数）× 100（病院報告。在院患者は毎日24時現在に在院している患者）",
  hospitalAlos: "平均在院日数 ＝ 在院患者延数 ÷｛1/2 ×（新入院患者数 ＋ 退院患者数）｝（病院報告。病棟の間の移動は数えない）",
  basicAlos: "平均在院日数 ＝ 直近3か月間の在院患者延日数 ÷｛（新入棟患者数 ＋ 新退棟患者数）÷ 2｝、小数点以下は切り上げ（別添6 別紙4）",
};

/** 別紙4 の2〜6 と 別表第二, shortened (the 通知 and 告示 are the authority). */
export const BASIC_ALOS_RULES = [
  "在院患者は毎日24時現在に在院中の患者で、入院してその日のうちに退院又は死亡した者を含む。病棟から他の病棟へ移動した日は、移動前の病棟の入院日として延日数に含める。",
  "新入棟患者数は、3か月間に新たに入院した患者と他の病棟から移動してきた患者の合計。その入院での1回目の入棟だけを数え、再入棟は数えない。3か月より前から入院していた患者は数えない。退院後に再入院した患者は新入院として数える。",
  "新退棟患者数は、3か月間に退院（死亡を含む）した患者と他の病棟へ移動した患者。その入院での1回目の退棟だけを数える。",
  "別表第二の患者（回復期リハビリテーション病棟入院料・地域包括ケア病棟入院料などを算定する患者、短期滞在手術等基本料1・3（入院した日から5日まで）を算定する患者など）は計算に入れない。短期滞在手術等基本料3の患者で6日以降も入院するものは、入院日から数えて含める。",
  "平均在院日数の基準は病棟の種別ごとに、保険診療の入院患者（別表第二の患者を除く）で計算する（告示 第五 一 通則(4)）。",
];

/**
 * 架空の病院の取り決め: the three wards of this prototype (5階東・5階南・6階東) all bill 急性期一般入院料４
 * (一般病棟入院基本料), so 入院基本料の平均在院日数 is counted over the three together (one 病棟の種別).
 */
export const UNIT_NOTE = "この試作の3病棟（5階東・5階南・6階東）は、どれも急性期一般入院料４（一般病棟入院基本料）を算定する病棟として、まとめて計算します。";

// ---------------------------------------------------------------------------
// The stays
// ---------------------------------------------------------------------------

export interface CensusPatient {
  id: string;
  name: string;
  department: string;
  admittedOn: DayOffset;
  dischargedAt?: { day: DayOffset };
}

const pos = (room: string, bed: string) => `${room}|${bed}`;

/** The other teams' patients have no admission day in the record: a fixed one from the name (新入院 = today). */
function otherAdmitted(b: BedAssignment): DayOffset {
  if (b.other?.note === "新入院") return 0;
  return -(1 + (seedFrom(`${b.room}${b.bed}${b.other?.name}`) % 24));
}

const LENGTHS = (r: Rng): number => {
  const x = r();
  if (x < 0.01) return 0;
  if (x < 0.3) return 1 + Math.floor(r() * 4);
  if (x < 0.8) return 5 + Math.floor(r() * 16);
  return 21 + Math.floor(r() * 25);
};
const GAPS = [0, 0, 1, 1, 2, 3, 4];

export function censusStays(opts: {
  today: CalendarDate;
  /** How many days of fictional record before today. */
  days: number;
  floors: Floor[];
  /** The beds as first placed (before today's moves), with patients discharged today still in them. */
  beds: BedAssignment[];
  moves: Record<string, { room: string; bed: string }>;
  patient: (id: string) => CensusPatient | undefined;
}): Stay[] {
  const { today, days, floors, beds, moves, patient } = opts;
  const iso = isoDate(today);
  const stays: Stay[] = [];
  const anchor = new Map<string, number>();
  const setAnchor = (k: string, d: number) => anchor.set(k, Math.min(anchor.get(k) ?? 1, d));
  const deptsOf = new Map<string, string[]>();

  // Today's stays, from the records.
  for (const b of beds) {
    const home = floorOf(b.room);
    if (b.other) {
      const d = otherAdmitted(b);
      stays.push({ id: `live:${pos(b.room, b.bed)}`, admission: `live:${pos(b.room, b.bed)}`, floor: home, dept: b.other.department, in: { day: d, kind: "入院" }, live: true, name: b.other.name });
      setAnchor(pos(b.room, b.bed), d);
      deptsOf.set(home, [...(deptsOf.get(home) ?? []), b.other.department]);
      continue;
    }
    const p = b.patientId ? patient(b.patientId) : undefined;
    if (!p) continue;
    const out = p.dischargedAt ? { day: p.dischargedAt.day, kind: "退院" as const } : undefined;
    const moved = moves[p.id];
    const there = moved ? floorOf(moved.room) : home;
    setAnchor(pos(b.room, b.bed), p.admittedOn);
    if (moved) setAnchor(pos(moved.room, moved.bed), 0);
    if (there !== home) {
      // 転棟 today: the first ward until today (転出), the new ward from today (転入).
      stays.push({ id: `live:${p.id}:1`, admission: `live:${p.id}`, floor: home, dept: p.department, in: { day: p.admittedOn, kind: "入院" }, out: { day: 0, kind: "転出" }, live: true, name: p.name });
      stays.push({ id: `live:${p.id}:2`, admission: `live:${p.id}`, floor: there, dept: p.department, in: { day: 0, kind: "転入" }, ...(out ? { out } : {}), live: true, name: p.name });
    } else stays.push({ id: `live:${p.id}`, admission: `live:${p.id}`, floor: home, dept: p.department, in: { day: p.admittedOn, kind: "入院" }, ...(out ? { out } : {}), live: true, name: p.name });
    deptsOf.set(home, [...(deptsOf.get(home) ?? []), p.department]);
  }

  // The fictional record before today, bed by bed, worked backwards from the first stay of today's records.
  const history: Stay[] = [];
  for (const f of floors) {
    const depts = deptsOf.get(f.name) ?? ["内科"];
    for (const room of f.rooms)
      for (const bed of room.beds) {
        const k = pos(room.no, bed);
        const r = makeRng(seedFrom(`census:${iso}:${k}`));
        let t = anchor.get(k) ?? 1;
        let n = 0;
        while (t > -days - 45) {
          const outDay = Math.min(t - GAPS[Math.floor(r() * GAPS.length)], -1);
          const len = LENGTHS(r);
          const dept = depts[Math.floor(r() * depts.length)];
          const short = dept === "消化器内科" && ((len >= 1 && len <= 2 && r() < 0.6) || r() < 0.02);
          const id = `h:${k}:${n++}`;
          history.push({ id, admission: id, floor: f.name, dept, in: { day: outDay - len, kind: "入院" }, out: { day: outDay, kind: r() < 0.03 ? "死亡" : "退院" }, ...(short ? { shortStay3: true } : {}) });
          t = outDay - len;
        }
      }
  }

  // Some discharges were moves to another ward the same day (転出 → 転入, the same admission).
  const r = makeRng(seedFrom(`census:${iso}:moves`));
  const starts = new Map<string, Stay[]>();
  for (const s of history) starts.set(`${s.in.day}`, [...(starts.get(`${s.in.day}`) ?? []), s]);
  const paired = new Set<string>();
  for (const s of [...history].sort((a, b) => a.out!.day - b.out!.day || a.id.localeCompare(b.id))) {
    if (s.out!.kind !== "退院" || s.shortStay3 || r() >= 0.05) continue;
    const next = (starts.get(`${s.out!.day}`) ?? []).find((x) => x.floor !== s.floor && x.in.kind === "入院" && !x.shortStay3 && !paired.has(x.id) && x.id !== s.id);
    if (!next) continue;
    paired.add(next.id);
    s.out = { day: s.out!.day, kind: "転出" };
    next.in = { day: next.in.day, kind: "転入" };
    next.admission = s.admission;
  }
  return [...stays, ...history];
}

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

/** In the ward at 24時 of the day (病院報告の在院患者). For today: still in now. */
export const presentAt = (s: Stay, d: DayOffset): boolean => s.in.day <= d && (!s.out || s.out.day > d);

export const bedsOf = (f: Floor): number => f.rooms.reduce((n, r) => n + r.beds.length, 0);

export interface DayRow {
  floor: string;
  beds: number;
  /** 前日24時の在院. */
  prev: number;
  admit: number;
  transferIn: number;
  discharge: number;
  death: number;
  transferOut: number;
  /** 24時の在院（今日は、いま）. */
  census: number;
  empty: number;
  /** 在院 ÷ 病床数 × 100. */
  rate: number;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

function dayRow(stays: Stay[], name: string, beds: number, d: DayOffset): DayRow {
  const on = (k: OutKind) => stays.filter((s) => s.out?.day === d && s.out.kind === k).length;
  const census = stays.filter((s) => presentAt(s, d)).length;
  return {
    floor: name,
    beds,
    prev: stays.filter((s) => presentAt(s, d - 1)).length,
    admit: stays.filter((s) => s.in.day === d && s.in.kind === "入院").length,
    transferIn: stays.filter((s) => s.in.day === d && s.in.kind === "転入").length,
    discharge: on("退院"),
    death: on("死亡"),
    transferOut: on("転出"),
    census,
    empty: beds - census,
    rate: beds ? r1((census / beds) * 100) : 0,
  };
}

/** 日報: each ward and the whole, on one day. The whole counts 転入・転出 between the wards as moves inside. */
export function dayReport(stays: Stay[], floors: Floor[], d: DayOffset): { rows: DayRow[]; total: DayRow } {
  const rows = floors.map((f) => dayRow(stays.filter((s) => s.floor === f.name), f.name, bedsOf(f), d));
  const total = dayRow(stays, "全病棟", floors.reduce((n, f) => n + bedsOf(f), 0), d);
  return { rows, total };
}

export interface Period {
  label: string;
  from: DayOffset;
  to: DayOffset;
}

export interface PeriodRow {
  floor: string;
  beds: number;
  days: number;
  /** 在院患者延数 (24時の在院の合計). */
  patientDays: number;
  admit: number;
  /** 退院（死亡を含む）. */
  discharge: number;
  death: number;
  transferIn: number;
  transferOut: number;
  /** 病床利用率（病院報告）. */
  utilization: number | null;
  /** 1日平均在院患者数. */
  avgCensus: number | null;
}

function periodRow(stays: Stay[], name: string, beds: number, p: Period): PeriodRow {
  const days = p.to - p.from + 1;
  let patientDays = 0;
  for (let d = p.from; d <= p.to; d++) patientDays += stays.filter((s) => presentAt(s, d)).length;
  const inP = (d?: DayOffset) => d !== undefined && d >= p.from && d <= p.to;
  return {
    floor: name,
    beds,
    days,
    patientDays,
    admit: stays.filter((s) => inP(s.in.day) && s.in.kind === "入院").length,
    discharge: stays.filter((s) => inP(s.out?.day) && s.out!.kind !== "転出").length,
    death: stays.filter((s) => inP(s.out?.day) && s.out!.kind === "死亡").length,
    transferIn: stays.filter((s) => inP(s.in.day) && s.in.kind === "転入").length,
    transferOut: stays.filter((s) => inP(s.out?.day) && s.out!.kind === "転出").length,
    utilization: beds && days ? r1((patientDays / (days * beds)) * 100) : null,
    avgCensus: days ? r1(patientDays / days) : null,
  };
}

/** 月報: each ward and the whole over a period, with 病院報告's 平均在院日数 for the whole hospital. */
export function periodReport(stays: Stay[], floors: Floor[], p: Period): { rows: PeriodRow[]; total: PeriodRow; alos: number | null } {
  const rows = floors.map((f) => periodRow(stays.filter((s) => s.floor === f.name), f.name, bedsOf(f), p));
  const total = periodRow(stays, "全病棟", floors.reduce((n, f) => n + bedsOf(f), 0), p);
  const denom = (total.admit + total.discharge) / 2;
  return { rows, total, alos: denom ? r1(total.patientDays / denom) : null };
}

export interface BasicAlos {
  /** ① 在院患者延日数. */
  patientDays: number;
  /** ② の 新入棟患者数・新退棟患者数. */
  newIn: number;
  newOut: number;
  /** 平均在院日数（小数点以下切り上げ）, null when ② is 0. */
  value: number | null;
  /** 別表第二で除いた入院の数. */
  excluded: number;
}

/** Ceil, without letting floating error (e.g. 13.000000001) round up. */
const ceil = (x: number) => Math.ceil(x - 1e-9);

/**
 * 入院基本料の平均在院日数（別添6 別紙4）over `period` for the wards in `unit` (one 病棟の種別). Moves between
 * the unit's wards stay inside it; per ward, pass that ward alone.
 */
export function basicAlos(stays: Stay[], unit: string[], period: Period): BasicAlos {
  const byAdmission = new Map<string, Stay[]>();
  for (const s of stays) byAdmission.set(s.admission, [...(byAdmission.get(s.admission) ?? []), s]);
  const inP = (d: DayOffset | undefined) => d !== undefined && d >= period.from && d <= period.to;
  let patientDays = 0;
  let newIn = 0;
  let newOut = 0;
  let excluded = 0;
  for (const all of byAdmission.values()) {
    const segs = [...all].sort((a, b) => a.in.day - b.in.day);
    const mine = segs.filter((s) => unit.includes(s.floor));
    if (!mine.length) continue;
    // 別表第二 二十二 / 別紙4 の6: 短期滞在手術等基本料３ — out of the count up to the 5th day of the admission;
    // from the 6th day, in it from the admission day.
    const start = segs[0].in.day;
    const end = segs[segs.length - 1].out?.day;
    if (segs.some((s) => s.shortStay3) && (end ?? period.to) - start + 1 <= 5) {
      if (start <= period.to && (end === undefined || end >= period.from)) excluded++;
      continue;
    }
    // ① the days in the unit at 24時, the day of a move out (移動した日は移動前の病棟の入院日), and a
    // same-day 退院・死亡 — each day once.
    const days = new Set<number>();
    for (const s of mine) {
      const last = s.out?.day ?? period.to + 1;
      for (let d = Math.max(s.in.day, period.from); d <= Math.min(period.to, last); d++) {
        if (d < last) days.add(d);
        else if (s.out && (s.out.kind === "転出" || s.in.day === s.out.day)) days.add(d);
      }
    }
    patientDays += days.size;
    // ② the first entry into the unit, and the first leaving of it (a move to another of the unit's wards is neither).
    const entry = mine[0];
    const exit = mine.find((s) => s.out && (s.out.kind !== "転出" || !segs.some((x) => x !== s && unit.includes(x.floor) && x.in.day === s.out!.day && x.in.kind === "転入")));
    if (inP(entry.in.day)) newIn++;
    if (exit && inP(exit.out?.day)) newOut++;
  }
  const denom = (newIn + newOut) / 2;
  return { patientDays, newIn, newOut, value: denom ? ceil(patientDays / denom) : null, excluded };
}

/** The last `n` whole calendar months before today's month, as one period (直近3か月). */
export function lastMonths(today: CalendarDate, n: number): Period {
  const base = Date.UTC(today.y, today.m - 1, today.d);
  const first = new Date(Date.UTC(today.y, today.m - 1 - n, 1));
  const last = new Date(Date.UTC(today.y, today.m - 1, 0));
  const off = (t: Date) => Math.round((t.getTime() - base) / 86_400_000);
  return { label: `${first.getUTCFullYear()}年${first.getUTCMonth() + 1}月〜${last.getUTCFullYear()}年${last.getUTCMonth() + 1}月`, from: off(first), to: off(last) };
}

/** 診療科別の入院患者: in the wards on the day, and over a period the 入院・退院・延数. */
export function deptCounts(stays: Stay[], d: DayOffset, p: Period): { dept: string; census: number; admit: number; discharge: number; patientDays: number }[] {
  const depts = [...new Set(stays.map((s) => s.dept))].sort((a, b) => a.localeCompare(b, "ja"));
  const inP = (x?: DayOffset) => x !== undefined && x >= p.from && x <= p.to;
  return depts.map((dept) => {
    const mine = stays.filter((s) => s.dept === dept);
    let patientDays = 0;
    for (let x = p.from; x <= p.to; x++) patientDays += mine.filter((s) => presentAt(s, x)).length;
    return {
      dept,
      census: mine.filter((s) => presentAt(s, d)).length,
      admit: mine.filter((s) => inP(s.in.day) && s.in.kind === "入院").length,
      discharge: mine.filter((s) => inP(s.out?.day) && s.out!.kind !== "転出").length,
      patientDays,
    };
  });
}

/** 外来の診療科別の患者数 over a period (from the outpatient day counts), and the clinic days. */
export function opdCounts(visits: { day: DayOffset; department: string; first: number; revisit: number; ambulance: number }[], p: Period): { dept: string; first: number; revisit: number; ambulance: number; days: number }[] {
  const inP = visits.filter((v) => v.day >= p.from && v.day <= p.to);
  const depts = [...new Set(inP.map((v) => v.department))];
  return depts.map((dept) => {
    const mine = inP.filter((v) => v.department === dept);
    return { dept, first: mine.reduce((n, v) => n + v.first, 0), revisit: mine.reduce((n, v) => n + v.revisit, 0), ambulance: mine.reduce((n, v) => n + v.ambulance, 0), days: new Set(mine.map((v) => v.day)).size };
  });
}

// ---------------------------------------------------------------------------
// CSV for Excel
// ---------------------------------------------------------------------------

export function dayCsv(title: string, r: { rows: DayRow[]; total: DayRow }, opd: { dept: string; first: number; revisit: number; ambulance: number }[]): string {
  const ward = [...r.rows, r.total].map((x) => [title, "入院", x.floor, x.beds, x.prev, x.admit, x.transferIn, x.discharge, x.death, x.transferOut, x.census, x.empty, x.rate]);
  const out = opd.map((x) => [title, "外来", x.dept, "", "", "", "", "", "", "", "", "", "", x.first, x.revisit, x.ambulance]);
  return csvOf(["日", "区分", "病棟・診療科", "病床数", "前日在院", "入院", "転入", "退院", "死亡", "転出", "在院", "空床", "在院÷病床(%)", "初診", "再診", "救急車"], [...ward, ...out]);
}

export function monthCsv(title: string, r: { rows: PeriodRow[]; total: PeriodRow; alos: number | null }, opd: { dept: string; first: number; revisit: number; ambulance: number; days: number }[]): string {
  const ward = [...r.rows, r.total].map((x) => [title, "入院", x.floor, x.beds, x.days, x.patientDays, x.avgCensus ?? "", x.admit, x.discharge, x.death, x.transferIn, x.transferOut, x.utilization ?? "", x === r.total ? (r.alos ?? "") : ""]);
  const out = opd.map((x) => [title, "外来", x.dept, "", x.days, "", "", "", "", "", "", "", "", "", x.first, x.revisit, x.ambulance]);
  return csvOf(["期間", "区分", "病棟・診療科", "病床数", "日数", "在院患者延数", "1日平均在院患者数", "新入院", "退院（死亡を含む）", "死亡", "転入", "転出", "病床利用率(%)", "平均在院日数（病院報告）", "初診", "再診", "救急車"], [...ward, ...out]);
}
