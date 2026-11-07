// 「/by system」と打って Enter で、系統別（by system）のプロブレムリストの枠を記事に貼る。
// 各系統は「＃ 系統」の行と、その下の「・」1行。・の行にはカルテにある最新の値（とその時刻・日）だけを
// コードで貼る。評価・方針は書かない（書くのは医師）。値が無い系統は空の「・ 」を残す。
// 系統の順と中身は架空の病院の取り決め。使わない系統は医師が行を消す。
import { gcsText } from "./consciousness";
import { addDays, type CalendarDate } from "./dates";
import { abs } from "./flowsheet";
import { ventAt } from "./icu/abg";
import { concentrationMgPerMl, doseFromMlPerH, rateAt } from "./icu/gamma";
import { lineDays } from "./icu/lines";
import type { IcuRecords, Infusion, VentSetting } from "./icu/types";
import { activeOrders } from "./active-orders";
import { ANALYTES, findDrug, findOralDrug, ingredientOf, rangeFor } from "./master";
import { INDENT } from "./note-edit";
import type { DayOffset, LabResult, OrderEntry, Patient } from "./types";

/** 「/by system」「/bysystem」「／ｂｙ　ｓｙｓｔｅｍ」（大文字小文字を問わない）だけの行。 */
export const isBySystemLine = (line: string) => /^\/by[ _-]*system$/i.test(line.normalize("NFKC").trim());

/** The systems, top to bottom. */
export const BY_SYSTEMS = ["神経", "呼吸", "循環", "腎・電解質", "消化器・栄養", "感染", "血液・凝固", "内分泌・代謝", "皮膚・ライン", "その他（リハ・退院支援）"] as const;
export type BySystem = (typeof BY_SYSTEMS)[number];

export interface BySystemInput {
  patient: Pick<Patient, "id" | "sex" | "labs" | "vitals" | "daily" | "dietNow" | "history">;
  /** The orders in effect (CheckContext.activeOrders): the antibiotics are read from these. */
  orders: OrderEntry[];
  /** The ICU record (ventilator, continuous infusions, lines, hourly records), when there is one. */
  icu?: IcuRecords;
  today: CalendarDate;
  /** Now, "HH:MM": nothing recorded after it is pasted. */
  now: string;
}

interface Stamp { day: DayOffset; time?: string }
interface Fact { text: string; at?: Stamp }

const fmt = (v: number) => (Number.isInteger(v) && Math.abs(v) >= 1000 ? v.toLocaleString("en-US") : String(v));
const stampText = (s: Stamp, today: CalendarDate) => {
  if (s.day === 0) return s.time ?? "今日";
  const d = addDays(today, s.day);
  return `${d.m}/${d.d}${s.time ? ` ${s.time}` : ""}`;
};
const stampKey = (s?: Stamp) => (s ? `${s.day} ${s.time ?? ""}` : "");

/** Facts in order; neighbours of the same time share it: 「Cre 2.6↑・Na 138（06:00）、尿量 854 mL/日（11/6）」. */
function joined(facts: (Fact | null | undefined)[], today: CalendarDate): string {
  const groups: { at?: Stamp; texts: string[] }[] = [];
  for (const f of facts) {
    if (!f) continue;
    const last = groups.at(-1);
    if (last && stampKey(last.at) === stampKey(f.at)) last.texts.push(f.text);
    else groups.push({ at: f.at, texts: [f.text] });
  }
  return groups.map((g) => g.texts.join("・") + (g.at ? `（${stampText(g.at, today)}）` : "")).join("、");
}

/** The newest row (by day and time, up to now) that has the value. */
function newest<T>(rows: T[], at: (r: T) => { day: DayOffset; time: string }, has: (r: T) => boolean, nowAbs: number): T | null {
  let best: T | null = null;
  let bestAbs = -Infinity;
  for (const r of rows) {
    if (!has(r)) continue;
    const a = abs(at(r).day, at(r).time);
    if (a <= nowAbs && a >= bestAbs) { best = r; bestAbs = a; }
  }
  return best;
}

/** 「Cre 2.6↑」 (↑↓ from the reference range, as in the LD paste; no unit, to keep the line short). */
function labFact(labs: LabResult[], code: string, sex: Patient["sex"], nowAbs: number, opts: { label?: string; flag?: boolean } = {}): Fact | null {
  const r = newest(labs, (l) => l, (l) => Number.isFinite(l.values[code]), nowAbs);
  if (!r) return null;
  const v = r.values[code];
  const a = ANALYTES.find((x) => x.code === code);
  const range = a && opts.flag !== false ? rangeFor(a, sex) : {};
  const flag = range.high !== undefined && v > range.high ? "↑" : range.low !== undefined && v < range.low ? "↓" : "";
  return { text: `${opts.label ?? code} ${fmt(v)}${flag}`, at: { day: r.day, time: r.time } };
}

function ventText(v: VentSetting): string | null {
  if (v.mode === "なし") return null;
  const head = v.mode === "HFNC" && v.flow !== undefined ? `HFNC ${v.flow}L` : v.mode;
  const parts = [head, `FiO2 ${v.fio2}`, v.peep !== undefined && `PEEP ${v.peep}`, v.ps !== undefined && `PS ${v.ps}`, v.pc !== undefined && `PC ${v.pc}`, v.vt !== undefined && `VT ${v.vt}`, v.rr !== undefined && `RR ${v.rr}`];
  return parts.filter(Boolean).join(" ");
}

/** Short names of the vasopressors and inotropes as written in an ICU note (the name in the ICU record). */
const PRESSORS: [RegExp, string][] = [[/ノルアドレナリン/, "NAd"], [/アドレナリン/, "Ad"], [/バソプレシン|ピトレシン/, "AVP"], [/ドブタミン/, "DOB"], [/ドパミン/, "DOA"], [/フェニレフリン|ネオシネジン/, "PE"]];

function pressorText(inf: Infusion, nowAbs: number): string | null {
  const name = PRESSORS.find(([re]) => re.test(inf.name))?.[1];
  if (!name) return null;
  const rate = rateAt(inf, nowAbs);
  const c = concentrationMgPerMl(inf);
  if (rate === null || rate <= 0) return null;
  const dose = c === null ? null : doseFromMlPerH(rate, c, inf.weightKg, inf.doseUnit);
  if (dose === null) return `${name} ${rate?.toFixed(1)}mL/h`;
  return `${name} ${dose.toFixed(inf.doseUnit === "γ" ? 2 : 1)}${inf.doseUnit}`;
}

/** The abbreviation (MEPM, CTRX …) when the master has one, else the ingredient's name. */
function abxName(code: string): string | null {
  const inj = findDrug(code);
  if (inj) {
    if (inj.kind !== "抗菌薬") return null;
    const abbr = inj.aliases.find((a) => /^[A-Z][A-Z0-9/]{1,11}$/.test(a));
    if (abbr) return abbr;
    const base = inj.generic ?? inj.name;
    return base.replace(/(塩酸塩|ナトリウム|硫酸塩|水和物)?(点滴静注用|点滴静注液|点滴静注|静注用|注射用|注射液|点滴用|筋注用|静注|注).*$/, "") || base;
  }
  const oral = findOralDrug(code);
  return oral?.classes?.some((c) => c.includes("抗菌薬")) ? ingredientOf(code) ?? oral.name : null;
}

const drugCodes = (e: OrderEntry): string[] => (e.order.type === "injection" ? e.order.items.map((i) => i.drugCode) : e.order.type === "prescription" ? [e.order.drugCode] : []);
const startDay = (e: OrderEntry): number | null => (e.order.type === "injection" || e.order.type === "prescription" ? e.order.start.day : null);

/** 「MEPM 4日目」: the antibiotics in effect today, counted from the first order they replaced (the start day is 1日目). */
function antibiotics(x: BySystemInput): string[] {
  const all = new Map<string, OrderEntry>();
  for (const e of x.patient.history) if (e.kind === "order") all.set(e.id, e);
  for (const e of x.orders) all.set(e.id, e);
  const seen = new Map<string, number>();
  for (const e of activeOrders(x.orders, 0)) {
    const start = startDay(e);
    if (start === null || start > 0) continue;
    const names = drugCodes(e).map(abxName).filter((n): n is string => !!n);
    if (!names.length) continue;
    let first = start;
    const visited = new Set<string>([e.id]);
    for (let prev = all.get((e.order as { replaces?: string }).replaces ?? ""); prev && !visited.has(prev.id); prev = all.get((prev.order as { replaces?: string }).replaces ?? "")) {
      visited.add(prev.id);
      const s = startDay(prev);
      if (s !== null) first = Math.min(first, s);
    }
    for (const n of names) seen.set(n, Math.min(seen.get(n) ?? first, first));
  }
  return [...seen].map(([n, first]) => `${n} ${1 - first}日目`);
}

/** The diet without its notes (禁止・補食・アレルギー), to keep the line short. */
const shortDiet = (diet: string) => diet.split("・").filter((b) => !/^(禁止|補食|アレルギー)：/.test(b)).join("・");

/** One fact line per system ("" when the chart has nothing for it). */
export function bySystemFacts(x: BySystemInput): { system: BySystem; fact: string }[] {
  const { patient: p, today } = x;
  const nowAbs = abs(0, x.now);
  const pid = p.id.replace(/^er:/, "");
  const icu = x.icu;
  const mine = <T extends { patientId: string }>(rows: T[] | undefined) => (rows ?? []).filter((r) => r.patientId === pid);
  const vitalAt = (v: { day: DayOffset; time: string }): Stamp => ({ day: v.day, time: v.time });
  const vital = <K extends keyof Patient["vitals"][number]>(k: K) => newest(p.vitals, (v) => v, (v) => v[k] !== undefined, nowAbs);
  const hourly = mine(icu?.hourly);
  const lab = (code: string, label?: string) => labFact(p.labs, code, p.sex, nowAbs, { label });

  // 神経
  const gcs = vital("gcs");
  const rass = newest(hourly, (h) => h.at, (h) => Number.isFinite(h.rass), nowAbs);
  const neuro = [gcs && { text: `GCS ${gcsText(gcs)}`, at: vitalAt(gcs) }, rass && { text: `RASS ${rass.rass! > 0 ? "+" : ""}${rass.rass}`, at: vitalAt(rass.at) }];

  // 呼吸
  const spo2 = vital("spo2");
  const vent = icu ? ventAt(icu.vents, pid, nowAbs) : null;
  const ventLine = vent && ventText(vent);
  const resp = [spo2 && { text: `SpO2 ${spo2.spo2}%`, at: vitalAt(spo2) }, !ventLine && spo2 ? { text: spo2.o2 || "室内気", at: vitalAt(spo2) } : null, ventLine ? { text: ventLine } : null];

  // 循環
  const bp = vital("sbp");
  const hr = vital("hr");
  const pressors = mine(icu?.infusions).map((inf) => pressorText(inf, nowAbs)).filter((t): t is string => !!t);
  const circ = [bp && { text: `BP ${bp.sbp}${bp.dbp !== undefined ? `/${bp.dbp}` : ""}`, at: vitalAt(bp) }, hr && { text: `HR ${hr.hr}`, at: vitalAt(hr) }, ...pressors.map((text) => ({ text }))];

  // 腎・電解質：尿量は締まった日（前日まで）の合計。
  const urine = [...p.daily].filter((d) => d.day < 0 && Number.isFinite(d.urineMl)).sort((a, b) => b.day - a.day)[0];
  const crrt = mine(icu?.crrt).filter((c) => abs(c.at.day, c.at.time) <= nowAbs && !(c.end && abs(c.end.day, c.end.time) <= nowAbs)).sort((a, b) => abs(b.at.day, b.at.time) - abs(a.at.day, a.at.time))[0];
  const renal = [lab("Cre"), lab("Na"), lab("K"), urine && { text: `尿量 ${fmt(urine.urineMl!)} mL/日`, at: { day: urine.day } }, crrt && { text: crrt.mode }];

  // 消化器・栄養：食事の指示。指示がなければ看護記録の絶食（その日）。
  const meals = p.dietNow ? null : [...p.daily].filter((d) => d.day <= 0 && d.meals !== undefined).sort((a, b) => b.day - a.day)[0];
  const gi = [p.dietNow ? { text: shortDiet(p.dietNow) } : meals?.meals === "絶食" ? { text: "絶食", at: { day: meals.day } } : null, lab("T-Bil")];

  // 感染
  const bt = vital("bt");
  const infection = [bt && { text: `BT ${bt.bt}℃`, at: vitalAt(bt) }, lab("WBC"), lab("CRP"), ...antibiotics(x).map((text) => ({ text }))];

  // 血液・凝固
  const heme = [lab("Hb"), lab("Plt"), lab("PT-INR")];

  // 内分泌・代謝：血糖は検体検査と ICU の 1 時間ごとの記録の新しいほう（印は付けない）。
  const gluLab = labFact(p.labs, "Glu", p.sex, nowAbs, { label: "血糖", flag: false });
  const gluIcu = newest(hourly, (h) => h.at, (h) => Number.isFinite(h.glucose), nowAbs);
  const gluIcuFact = gluIcu && { text: `血糖 ${gluIcu.glucose}`, at: vitalAt(gluIcu.at) };
  const glucose = gluLab && gluIcuFact ? (abs(gluLab.at!.day, gluLab.at!.time!) >= abs(gluIcuFact.at.day, gluIcuFact.at.time!) ? gluLab : gluIcuFact) : gluLab ?? gluIcuFact;

  // 皮膚・ライン：入っているライン・チューブを日数ごとにまとめる。
  const byDays = new Map<string, string[]>();
  for (const l of mine(icu?.lines)) {
    if (l.insertedAt.day > 0 || abs(l.insertedAt.day, l.insertedAt.time) > nowAbs || (l.removedAt && abs(l.removedAt.day, l.removedAt.time) <= nowAbs)) continue;
    const d = lineDays(l, 0);
    byDays.set(d, [...(byDays.get(d) ?? []), l.kind]);
  }
  const lines = byDays.size ? [{ text: [...byDays].map(([d, kinds]) => `${[...new Set(kinds)].join("・")} ${d}`).join("、") }] : [];

  const facts: Record<BySystem, (Fact | null | undefined)[]> = {
    神経: neuro, 呼吸: resp, 循環: circ, "腎・電解質": renal, "消化器・栄養": gi, 感染: infection, "血液・凝固": heme, "内分泌・代謝": [glucose], "皮膚・ライン": lines, "その他（リハ・退院支援）": [],
  };
  return BY_SYSTEMS.map((system) => ({ system, fact: joined(facts[system], today) }));
}

/** The lines to paste: 「＃ 神経」 then 「  ・ GCS …」, for each system. */
export function bySystemText(x: BySystemInput): string {
  return bySystemFacts(x).map(({ system, fact }) => `＃ ${system}\n${INDENT}・ ${fact}`).join("\n");
}

/** Where the caret goes in the pasted text: the end of the first 「・」 line. */
export function bySystemCaret(text: string): number {
  const [head = "", body = ""] = text.split("\n");
  return head.length + 1 + body.length;
}
