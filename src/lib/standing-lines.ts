import { standingSeeds } from "./standing-seeds";
// 指示簿の行（フリーコメント）: each line of the 指示簿 is a sentence the doctor writes (or picks from a
// template and edits), with a category, a start, an optional end, who wrote it, and — when stopped — the
// stop (time, who, why). A stopped line stays as history. The calendar draws each line as a bar from its
// start to its end; the worksheet's 指示受け takes new and stopped lines like other order changes.
// The categories and the hospital's templates are 架空の病院の取り決め (fictional). Nothing here is decided
// by AI: the doctor writes, the nurse takes.

import { abs } from "./flowsheet";
import { ruleText } from "./cond-orders";
import { callText, prnText, type StandingOrders } from "./standing";
import type { DayOffset } from "./types";
import { changeKey, type OtherChange, type WorkPatient } from "./worksheet";

export const LINE_CATS = ["安静", "ADL", "食事", "清潔", "排泄", "観察", "バイタル", "呼出基準", "処置", "検査", "頓用", "その他"] as const;
export type LineCat = (typeof LINE_CATS)[number];

/** A day, with a clock time when one is meant (「11/4 10:00から」 vs 「11/4から」). */
export interface When {
  day: DayOffset;
  time?: string;
}

export interface StandingLine {
  id: string;
  cat: LineCat;
  text: string;
  start: When;
  /** The planned end (the last day the line holds). Absent = continues until changed. */
  end?: When;
  by: string;
  /** When it was written. */
  at: { day: DayOffset; time: string };
  /** 中止: the line stays as history; the bar ends here. */
  stop?: { day: DayOffset; time: string; by: string; reason?: string; kind?: "終了" };
  /** Derived from the 項目で選ぶ fields (安静度・清潔…): read-only on the calendar, stopped through those fields. */
  changed?: { day: number; time: string; by: string; toId: string; reason?: string };
  changedFrom?: string;
  changeReason?: string;
  fromFields?: true;
}

export const LINE_RULES = {
  cats: "分類：安静度・ADL・食事・清潔・排泄・観察・バイタル・呼出基準・処置・検査・頓用・その他。",
  templates: "院内のテンプレートの文は例です。医師が直してから確定します。自分のテンプレートはこの端末のみに保存されます。",
  prn: "頓用を文で書くときは、薬・1回量・間隔・1日の回数を文の中に書いてください。添付文書の上限とアレルギーのコードによる確認は、「項目で選ぶ」の頓用でだけ行います。",
};

/** The last day of the bar: the stop, the planned end, or null (continues). */
export const lineEndDay = (l: StandingLine): DayOffset | null => (l.stop && l.end ? Math.min(l.stop.day, l.end.day) : l.stop ? l.stop.day : l.end ? l.end.day : null);

/** Whether the line holds on a day (a stopped line holds up to the day it was stopped). */
export function lineOn(l: StandingLine, day: DayOffset): boolean {
  const end = lineEndDay(l);
  return l.start.day <= day && (end === null || day <= end);
}

/** Lines in force or planned (not stopped, not past their end) — what is printed and what the nurse reads. */
export const currentLines = (lines: StandingLine[], today: DayOffset = 0): StandingLine[] => lines.filter((l) => (!l.changed || l.changed.day > today) && (!l.stop || l.stop.day > today) && (l.end === undefined || l.end.day >= today));

/** Lines kept as history: stopped, or past their end. */
export const pastLines = (lines: StandingLine[], today: DayOffset = 0): StandingLine[] => lines.filter((l) => (!!l.changed && l.changed.day <= today) || (!!l.stop && l.stop.day <= today) || (l.end !== undefined && l.end.day < today));

/** Why a line cannot be confirmed yet (empty when it can). */
export function lineProblems(l: { text: string; start: When; end?: When }): string[] {
  const out: string[] = [];
  if (!l.text.trim()) out.push("指示の文を入れてください。");
  if (l.end && (l.end.day < l.start.day || (l.end.day === l.start.day && l.end.time && l.start.time && l.end.time < l.start.time))) out.push("終了が開始より前になっています。");
  return out;
}

/** The text with its category: 「安静：病棟内フリー」. A text that already starts with the category is left alone. */
export const lineLabel = (l: Pick<StandingLine, "cat" | "text">) => (l.text.includes("\n") || l.text.startsWith(l.cat) ? l.text : `${l.cat}：${l.text}`);

/** 「11/4 10:00」 or 「11/4」, with the given day formatter. */
export const whenText = (w: When, fmtDay: (d: DayOffset) => string) => `${fmtDay(w.day)}${w.time ? ` ${w.time}` : ""}`;

/** 中止: the line stays; only the stop is written on it. A line already stopped, or derived from the fields, is left as it is. */
export function stopLine(lines: StandingLine[], id: string, stop: { day: DayOffset; time: string; by: string; reason?: string; kind?: "終了" }): StandingLine[] {
  return lines.map((l) => (l.id === id && !l.stop && !l.changed && !l.fromFields && stop.day >= l.start.day && (lineEndDay(l) === null || stop.day <= lineEndDay(l)!) ? { ...l, stop: { ...stop, reason: stop.reason?.trim() || undefined } } : l));
}

/** Replace a free line while preserving the original and its link to the successor. */
export function changeLine(lines: StandingLine[], id: string, next: { text: string; start: When; end?: When }, who: string, at: { day: number; time: string }, reason?: string): { lines: StandingLine[]; newId: string } {
  const start = { ...next.start, time: next.start.time ?? (next.start.day === at.day ? at.time : undefined) };
  const old = lines.find((l) => l.id === id);
  const endOnlyChange = !!old && next.text === old.text && (next.end?.day !== old.end?.day || next.end?.time !== old.end?.time);
  const futureEndChange = !!old && old.start.day > at.day && next.text === old.text && next.start.day === old.start.day && next.start.time === old.start.time;
  if (!old || old.fromFields || old.stop || old.changed || lineProblems(next).length || (!futureEndChange && ((!endOnlyChange && !lineOn(old, at.day)) || abs(old.start.day, old.start.time ?? "00:00") > abs(at.day, at.time))) || (!endOnlyChange && old.end && abs(old.end.day, old.end.time ?? "23:59") < abs(at.day, at.time)) || (!futureEndChange && abs(start.day, start.time ?? "00:00") !== abs(at.day, at.time))) return { lines, newId: "" };
  let newId = `${id}-change-${at.day}-${at.time}`;
  while (lines.some((l) => l.id === newId)) newId += "-1";
  return { newId, lines: [...lines.map((l) => l.id === id ? { ...l, end: old.end && abs(old.end.day, old.end.time ?? "23:59") < abs(at.day, at.time) ? old.end : { ...at }, changed: { ...at, by: who, toId: newId, reason: reason?.trim() || undefined } } : l), { id: newId, cat: old.cat, start, end: next.end ? { ...next.end } : undefined, text: next.text.trim(), by: who, at: { ...at }, changedFrom: id, changeReason: reason?.trim() || undefined }] };
}

export function barMark(l: StandingLine, day: number, lastDay: number): "start" | "mid" | "end" | "arrow" | "stop" | "changed" | null {
  if (!lineOn(l, day)) return null;
  if (lineEndDay(l) === day) return l.changed ? "changed" : l.stop ? l.stop.kind === "終了" ? "end" : "stop" : "end";
  if (day === lastDay) return "arrow";
  return day === l.start.day ? "start" : "mid";
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export const LINE_CAL_AHEAD = 3;

/** The days of the 指示簿カレンダー: from admission (at most 14 days back) to a few days ahead. */
export function lineCalendarDays(admittedOn: DayOffset, ahead = LINE_CAL_AHEAD, back = 14): DayOffset[] {
  const days: DayOffset[] = [];
  for (let d = Math.max(admittedOn, -back); d <= ahead; d++) days.push(d);
  return days;
}

export interface LineGroup {
  cat: LineCat;
  lines: StandingLine[];
}

/** Rows of the calendar: the lines grouped by category (in the hospital's order), each group by start then by writing time. */
export function calendarRows(lines: StandingLine[]): LineGroup[] {
  const key = (l: StandingLine) => abs(l.start.day, l.start.time ?? "00:00") * 10 + (l.fromFields ? 0 : 1);
  return LINE_CATS.flatMap((cat) => {
    const ls = lines.filter((l) => l.cat === cat).sort((a, b) => key(a) - key(b) || abs(a.at.day, a.at.time) - abs(b.at.day, b.at.time));
    return ls.length ? [{ cat, lines: ls }] : [];
  });
}

export interface BarCell {
  on: boolean;
  /** The first day of the bar (the start time is written here). */
  first: boolean;
  /** The last day of the bar (the end, or the stop, is written here). */
  last: boolean;
  /** The bar goes on past the last column. */
  continues: boolean;
  label: string;
}

/** What one cell of a line's row shows on a day. */
export function barCell(l: StandingLine, day: DayOffset, lastDay: DayOffset): BarCell {
  const end = lineEndDay(l);
  const on = lineOn(l, day);
  const first = on && day === l.start.day;
  const last = on && end !== null && day === end;
  const bits: string[] = [];
  if (first && l.start.time) bits.push(l.start.time);
  if (last) bits.push(l.changed ? `変更前 ${l.changed.time}` : l.stop ? `${l.stop.kind ?? "中止"} ${l.stop.time}` : l.end?.time ? `〜${l.end.time}` : "〜終了");
  return { on, first, last, continues: on && day === lastDay && (end === null || end > lastDay), label: bits.join(" ") };
}

// ---------------------------------------------------------------------------
// The 項目で選ぶ fields (安静度・清潔・バイタル・体重・水分出納・呼出基準・頓用・その他) as lines, one per change.
// Each version that changes a field closes the earlier line (its end = the day of the change) and opens a new one.
// ---------------------------------------------------------------------------

type FieldLine = { key: string; cat: LineCat; text: string };

function fieldLinesOf(s: StandingOrders): FieldLine[] {
  const out: FieldLine[] = [];
  if (s.rest) out.push({ key: "rest", cat: "安静", text: `安静度：${s.rest}` });
  if (s.bath) out.push({ key: "bath", cat: "清潔", text: `清潔：${s.bath}` });
  if (s.vitals) out.push({ key: "vitals", cat: "バイタル", text: `バイタル測定：${s.vitals}` });
  if (s.weight) out.push({ key: "weight", cat: "バイタル", text: `体重測定：${s.weight}` });
  if (s.io) out.push({ key: "io", cat: "観察", text: `水分出納：${s.io}` });
  const calls = [...s.calls.map(callText), ...(s.callConscious ? ["意識レベルの低下"] : [])];
  if (calls.length) out.push({ key: "calls", cat: "呼出基準", text: `医師を呼ぶ：${calls.join("、")}` });
  for (const r of s.prn) out.push({ key: `prn:${r.id}`, cat: "頓用", text: prnText(r) });
  for (const r of s.conds ?? []) out.push({ key: `cond:${r.id}`, cat: "呼出基準", text: ruleText(r) });
  if (s.other.trim()) out.push({ key: "other", cat: "その他", text: s.other.trim() });
  return out;
}

/** The structured 指示簿 (every version) as read-only lines, so the calendar shows them with the free lines. */
export function linesFromFields(versions: StandingOrders[]): StandingLine[] {
  const out: StandingLine[] = [];
  const open = new Map<string, { line: StandingLine; text: string }>();
  versions.forEach((v, i) => {
    const now = fieldLinesOf(v);
    const seen = new Set<string>();
    for (const f of now) {
      seen.add(f.key);
      const cur = open.get(f.key);
      const ending = v.fieldEnds?.[f.key];
      if (cur && (!cur.line.stop || !!ending) && cur.text === f.text && (cur.line.end?.day === v.until || !!ending)) {
        if (ending) cur.line.stop = { ...ending };
        continue;
      }
      if (cur && (cur.line.end === undefined || cur.line.end.day >= v.at.day)) cur.line.end = { day: v.at.day, time: v.at.time };
      const line: StandingLine = { id: `fld-${i}-${f.key}`, cat: f.cat, text: f.text, start: { day: v.at.day, time: v.at.time }, end: v.until === undefined ? undefined : { day: v.until }, by: v.by, at: { ...v.at }, stop: ending ? { ...ending } : undefined, fromFields: true };
      if (cur && !cur.line.stop && cur.line.end?.day === v.at.day) { cur.line.changed = { ...v.at, by: v.by, toId: line.id, reason: v.reason }; line.changedFrom = cur.line.id; line.changeReason = v.reason; }
      out.push(line);
      open.set(f.key, { line, text: f.text });
    }
    for (const [k, cur] of open) {
      if (seen.has(k)) continue;
      if (!cur.line.stop && (cur.line.end === undefined || cur.line.end.day >= v.at.day)) {
        cur.line.end = { day: v.at.day, time: v.at.time };
        cur.line.stop = { ...v.at, by: v.by, reason: v.reason };
      }
      open.delete(k);
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// 指示受け: a new or stopped line is a change the nurse takes on the worksheet (with the other changes).
// ---------------------------------------------------------------------------

export function lineChanges(people: WorkPatient[], lines: Record<string, StandingLine[]>, initialIds: Set<string>, since: number, nowAbs: number, fmtDay: (d: DayOffset) => string): OtherChange[] {
  const out: OtherChange[] = [];
  for (const { patient: p, room } of people) {
    for (const l of lines[p.id] ?? []) {
      const at = abs(l.at.day, l.at.time);
      if (!initialIds.has(l.id) && at >= since && at <= nowAbs && abs(l.start.day, l.start.time ?? "00:00") <= nowAbs && (!l.end || abs(l.end.day, l.end.time ?? "23:59") >= nowAbs)) {
        const span = `${whenText(l.start, fmtDay)}から${l.end ? ` ${whenText(l.end, fmtDay)}まで` : "（変えるまで）"}`;
        out.push({ kind: "指示簿", at, text: { type: "指示簿", main: l.changedFrom ? `【変】指示を変更：${lineLabel((lines[p.id] ?? []).find((x) => x.id === l.changedFrom) ?? l)} → ${l.text}` : lineLabel(l), detail: `${span}${l.changeReason ? ` 理由：${l.changeReason}` : ""}`, author: l.by }, patientId: p.id, room, name: p.name, key: changeKey(l.id, "新規"), timeKnown: true });
      }
      if (l.stop) {
        const st = abs(l.stop.day, l.stop.time);
        if (st >= since && st <= nowAbs) out.push({ kind: "指示簿", at: st, text: { type: "指示簿", main: `${l.stop.kind ?? "中止"}：${lineLabel(l)}`, detail: `${whenText({ day: l.stop.day, time: l.stop.time }, fmtDay)} ${l.stop.kind ?? "中止"}${l.stop.reason ? `　理由：${l.stop.reason}` : ""}`, author: l.stop.by }, patientId: p.id, room, name: p.name, key: changeKey(l.id, "中止"), timeKnown: true });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// ---------------------------------------------------------------------------
// Templates: the hospital's (fictional) and the doctor's own (this browser only).
// ---------------------------------------------------------------------------

export interface LineTemplate {
  id: string;
  cat: LineCat;
  text: string;
}

/** First line is the title; the remaining lines are the doctor's free text. */
export function categoryFromTitle(title: string): LineCat {
  if (/Dr\.?\s*call|ドクターコール|Drコール|医師を呼ぶ/i.test(title)) return "呼出基準";
  if (/基本指示|安静/.test(title)) return "その他";
  if (/時|頓用|スライディング|スケール|インスリン/.test(title)) return "頓用";
  return "その他";
}

export const standingTitle = (text: string) => text.split("\n")[0];
export const newestLines = (lines: StandingLine[]) => [...lines].reverse().sort((a, b) => abs(b.at.day, b.at.time) - abs(a.at.day, a.at.time));

/** 架空の病院の取り決め。量・閾値は医師が直して確定する例。 */
export const HOSPITAL_LINE_TEMPLATES: LineTemplate[] = [
  { id: "h-basic", cat: "その他", text: "基本指示\n安静度：\nADL：\n食事：\n清潔：\n排泄：\nモニター：なし" },
  { id: "h-prn-fever", cat: "頓用", text: "発熱時指示\n38℃以上：カロナール錠500mg（アセトアミノフェン）1錠 頓用。4時間以上あけて1日3回まで。\n38.5℃以上で血液培養2セット採取し Drコール。" },
  { id: "h-prn-pain", cat: "頓用", text: "疼痛時指示\nカロナール錠500mg（アセトアミノフェン）頓用。\n効果不十分時：ロキソニン錠60mg（ロキソプロフェン）。腎機能・潰瘍を確認。" },
  { id: "h-prn-nausea", cat: "頓用", text: "嘔気時、嘔吐時指示\n経口摂取可能時：ナウゼリン錠10mg（ドンペリドン）頓用。\n経口摂取不可能時：プリンペラン注10mg（メトクロプラミド）1A IV。" },
  { id: "h-prn-sleep", cat: "頓用", text: "不眠時指示\n医師に連絡。" },
  { id: "h-prn-constip", cat: "頓用", text: "便秘時指示\nプルゼニド錠12mg（センノシド）2錠 眠前。" },
  { id: "h-prn-bp", cat: "頓用", text: "血圧上昇時指示\n連絡基準：\n対応：" },
  { id: "h-prn-glucose", cat: "頓用", text: "低血糖時指示\n血糖70mg/dl未満：経口摂取可能ならブドウ糖10g。\n経口摂取不可能なら50%ブドウ糖液20mL IV し Drコール。" },
  { id: "h-insulin", cat: "頓用", text: "インスリンスライディングスケール\n薬品：ノボラピッド注（インスリン アスパルト）皮下ワンショット\n用法：1日3回、食前の血糖値で確認\n血糖スケール：\n70mg/dl未満：低血糖時指示参照\n70〜180mg/dl：投与なし\n181〜230mg/dl：2単位\n231〜280mg/dl：4単位\n281〜330mg/dl：6単位\n331〜499mg/dl：Drコール\n500mg/dl以上：Drコール" },
  { id: "h-call", cat: "呼出基準", text: "Drコール指示\nSBP 90mmHg以下・180mmHg以上\nHR 120/分以上・40/分以下\nSpO2 92%未満\n意識レベル低下\n尿量0.5mL/kg/h未満が2時間続くとき\n上記の場合は医師に連絡。" },
];

/** Why a template cannot be registered yet (empty when it can). */
export function templateProblems(cat: LineCat, text: string, mine: LineTemplate[]): string[] {
  const out: string[] = [];
  if (!text.trim()) out.push("文を入れてください。");
  else if (mine.some((t) => t.cat === cat && t.text.trim() === text.trim())) out.push("同じ文のテンプレートがあります。");
  return out;
}

const storeKey = (user: string) => `simple-karte:standing-templates:${user}`;

/** The doctor's own templates, kept in this browser only. */
export function loadMyTemplates(user: string): LineTemplate[] {
  try {
    const v = typeof window === "undefined" ? null : window.localStorage.getItem(storeKey(user));
    if (v === null) return [];
    const o: unknown = JSON.parse(v);
    return Array.isArray(o) ? (o as LineTemplate[]).filter((t) => t && typeof t.id === "string" && typeof t.text === "string" && (LINE_CATS as readonly string[]).includes(t.cat)) : [];
  } catch {
    return [];
  }
}

export function saveMyTemplates(user: string, list: LineTemplate[]): boolean {
  try {
    window.localStorage.setItem(storeKey(user), JSON.stringify(list));
    return true;
  } catch {
    // Storage blocked (private window): the templates last until the page is closed.
    return false;
  }
}

// ---------------------------------------------------------------------------
// Fictional lines of the four patients with charts (taken before this session).
// ---------------------------------------------------------------------------

export function initialLines(): Record<string, StandingLine[]> {
  return structuredClone(standingSeeds);
}

export const INITIAL_LINE_IDS: Set<string> = new Set(Object.values(initialLines()).flat().map((l) => l.id));
