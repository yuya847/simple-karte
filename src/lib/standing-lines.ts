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
  stop?: { day: DayOffset; time: string; by: string; reason?: string };
  /** Derived from the 項目で選ぶ fields (安静度・清潔…): read-only on the calendar, stopped through those fields. */
  fromFields?: true;
}

export const LINE_RULES = {
  cats: "分類（安静度・ADL・食事・清潔・排泄・観察・バイタル・呼出基準・処置・検査・頓用・その他）は架空の病院の取り決めです。",
  templates: "院内のテンプレートは架空の病院の取り決めです（文は例。医師が直してから確定します）。自分のテンプレートはこの端末のみに保存されます。",
  prn: "頓用を文で書くときは、薬・1回量・間隔・1日の回数を文の中に書いてください。添付文書の上限とアレルギーのコードによる確認は、「項目で選ぶ」の頓用でだけ行います。",
};

/** The last day of the bar: the stop, the planned end, or null (continues). */
export const lineEndDay = (l: StandingLine): DayOffset | null => (l.stop ? l.stop.day : l.end ? l.end.day : null);

/** Whether the line holds on a day (a stopped line holds up to the day it was stopped). */
export function lineOn(l: StandingLine, day: DayOffset): boolean {
  const end = lineEndDay(l);
  return l.start.day <= day && (end === null || day <= end);
}

/** Lines in force or planned (not stopped, not past their end) — what is printed and what the nurse reads. */
export const currentLines = (lines: StandingLine[], today: DayOffset = 0): StandingLine[] => lines.filter((l) => !l.stop && (l.end === undefined || l.end.day >= today));

/** Lines kept as history: stopped, or past their end. */
export const pastLines = (lines: StandingLine[], today: DayOffset = 0): StandingLine[] => lines.filter((l) => !!l.stop || (l.end !== undefined && l.end.day < today));

/** Why a line cannot be confirmed yet (empty when it can). */
export function lineProblems(l: { text: string; start: When; end?: When }): string[] {
  const out: string[] = [];
  if (!l.text.trim()) out.push("指示の文を入れてください。");
  if (l.end && (l.end.day < l.start.day || (l.end.day === l.start.day && l.end.time && l.start.time && l.end.time < l.start.time))) out.push("終了が開始より前になっています。");
  return out;
}

/** The text with its category: 「安静：病棟内フリー」. A text that already starts with the category is left alone. */
export const lineLabel = (l: Pick<StandingLine, "cat" | "text">) => (l.text.startsWith(l.cat) ? l.text : `${l.cat}：${l.text}`);

/** 「11/4 10:00」 or 「11/4」, with the given day formatter. */
export const whenText = (w: When, fmtDay: (d: DayOffset) => string) => `${fmtDay(w.day)}${w.time ? ` ${w.time}` : ""}`;

/** 中止: the line stays; only the stop is written on it. A line already stopped, or derived from the fields, is left as it is. */
export function stopLine(lines: StandingLine[], id: string, stop: { day: DayOffset; time: string; by: string; reason?: string }): StandingLine[] {
  return lines.map((l) => (l.id === id && !l.stop && !l.fromFields ? { ...l, stop: { ...stop, reason: stop.reason?.trim() || undefined } } : l));
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
  if (last) bits.push(l.stop ? `中止 ${l.stop.time}` : l.end?.time ? `〜${l.end.time}` : "〜終了");
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
      if (cur && cur.text === f.text) continue;
      if (cur) cur.line.end = { day: v.at.day, time: v.at.time };
      const line: StandingLine = { id: `fld-${i}-${f.key}`, cat: f.cat, text: f.text, start: { day: v.at.day, time: v.at.time }, by: v.by, at: { ...v.at }, fromFields: true };
      out.push(line);
      open.set(f.key, { line, text: f.text });
    }
    for (const [k, cur] of open) {
      if (seen.has(k)) continue;
      cur.line.end = { day: v.at.day, time: v.at.time };
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
      if (!initialIds.has(l.id) && at >= since && at <= nowAbs) {
        const span = `${whenText(l.start, fmtDay)}から${l.end ? ` ${whenText(l.end, fmtDay)}まで` : "（変えるまで）"}`;
        out.push({ kind: "指示簿", at, text: { type: "指示簿", main: lineLabel(l), detail: span, author: l.by }, patientId: p.id, room, name: p.name, key: changeKey(l.id, "新規"), timeKnown: true });
      }
      if (l.stop) {
        const st = abs(l.stop.day, l.stop.time);
        if (st >= since && st <= nowAbs) out.push({ kind: "指示簿", at: st, text: { type: "指示簿", main: `中止：${lineLabel(l)}`, detail: `${whenText({ day: l.stop.day, time: l.stop.time }, fmtDay)} 中止${l.stop.reason ? `　理由：${l.stop.reason}` : ""}`, author: l.stop.by }, patientId: p.id, room, name: p.name, key: changeKey(l.id, "中止"), timeKnown: true });
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

/** 院内のテンプレート (架空の病院の取り決め). Plain sentences the doctor edits before confirming. */
export const HOSPITAL_LINE_TEMPLATES: LineTemplate[] = [
  { id: "h-adl", cat: "ADL", text: "一部介助" },
  { id: "h-lab", cat: "検査", text: "38℃以上で血液培養2セット採取し Dr.call" },
  { id: "h-rest-bed", cat: "安静", text: "安静度：ベッド上安静（排泄もベッド上）" },
  { id: "h-rest-head", cat: "安静", text: "安静度：ベッド上、頭を上げてよい" },
  { id: "h-rest-wc", cat: "安静", text: "安静度：車いす（移動は介助で）" },
  { id: "h-rest-ward", cat: "安静", text: "安静度：病棟内フリー" },
  { id: "h-rest-hosp", cat: "安静", text: "安静度：院内フリー" },
  { id: "h-diet-npo-w", cat: "食事", text: "絶食（水分はよい）" },
  { id: "h-diet-npo", cat: "食事", text: "絶食（水分もとらない）" },
  { id: "h-diet-restart", cat: "食事", text: "食事の再開は医師が指示する" },
  { id: "h-bath-wipe", cat: "清潔", text: "清拭" },
  { id: "h-bath-shower", cat: "清潔", text: "シャワー浴（介助で）" },
  { id: "h-bath-tub", cat: "清潔", text: "入浴してよい" },
  { id: "h-elim-walk", cat: "排泄", text: "トイレまで歩いてよい" },
  { id: "h-elim-portable", cat: "排泄", text: "ポータブルトイレ" },
  { id: "h-elim-none", cat: "排泄", text: "3日排便がなければ報告" },
  { id: "h-obs-io", cat: "観察", text: "水分出納（IN/OUT）を測る" },
  { id: "h-obs-wt", cat: "観察", text: "体重を毎朝測る" },
  { id: "h-obs-wound", cat: "観察", text: "創部の出血・腫れを勤務ごとに見る" },
  { id: "h-obs-consc", cat: "観察", text: "意識レベルを勤務ごとに見る" },
  { id: "h-vs-3", cat: "バイタル", text: "バイタル測定：1日3回" },
  { id: "h-vs-4h", cat: "バイタル", text: "バイタル測定：4時間ごと" },
  { id: "h-vs-2h", cat: "バイタル", text: "バイタル測定：2時間ごと（落ち着いたら4時間ごとに戻す）" },
  { id: "h-vs-spo2", cat: "バイタル", text: "SpO2 を持続モニターで見る" },
  { id: "h-call-sbp180", cat: "呼出基準", text: "SBP（収縮期血圧）180mmHg以上で Dr.call" },
  { id: "h-call-o2", cat: "呼出基準", text: "SpO2 90%未満で O2 2L/分 開始し Dr.call" },
  { id: "h-call-glucose", cat: "頓用", text: "血糖70mg/dL未満でブドウ糖10g 内服し Dr.call（意識が清明で嚥下できる場合。嚥下できなければ内服せず直ちに Dr.call）" },
  { id: "h-call-u100", cat: "呼出基準", text: "尿量が4時間で100mL未満で Dr.call" },
  { id: "h-prn-loxo", cat: "頓用", text: "疼痛時：ロキソプロフェン60mg 1錠 内服、6時間以上あけて1日3回まで" },
  { id: "h-call-bp", cat: "呼出基準", text: "収縮期血圧 90mmHg以下、または 180mmHg以上で医師を呼ぶ" },
  { id: "h-call-hr", cat: "呼出基準", text: "脈拍 120/分以上、または 40/分以下で医師を呼ぶ" },
  { id: "h-call-bt", cat: "呼出基準", text: "体温 38.5℃以上が頓用で下がらないとき医師を呼ぶ" },
  { id: "h-call-spo2", cat: "呼出基準", text: "SpO2 92%未満で医師を呼ぶ" },
  { id: "h-call-consc", cat: "呼出基準", text: "意識レベルが下がったら医師を呼ぶ" },
  { id: "h-call-urine", cat: "呼出基準", text: "排尿が6時間以上ないとき医師を呼ぶ" },
  { id: "h-proc-suction", cat: "処置", text: "吸引は必要時" },
  { id: "h-proc-gauze", cat: "処置", text: "創部のガーゼ交換は1日1回（朝）" },
  { id: "h-proc-foley", cat: "処置", text: "尿道カテーテルは留置のまま（抜くときは医師が指示する）" },
  { id: "h-proc-stocking", cat: "処置", text: "弾性ストッキングを着ける" },
  { id: "h-prn-fever", cat: "頓用", text: "発熱時（38℃以上）：アセトアミノフェン錠500mg 1錠 内服、6時間以上あけて1日2回まで" },
  { id: "h-prn-pain", cat: "頓用", text: "疼痛時：アセトアミノフェン錠500mg 1錠、6時間以上あけて1日3回まで" },
  { id: "h-prn-constip", cat: "頓用", text: "便秘時（3日排便なし）：センノシド錠12mg 2錠 眠前、1日1回まで" },
  { id: "h-prn-sleep", cat: "頓用", text: "不眠時：医師に連絡（睡眠薬はオーダで出す）" },
  { id: "h-prn-nausea", cat: "頓用", text: "嘔気時：医師に連絡" },
  { id: "h-other-fall", cat: "その他", text: "転倒に注意（ベッド柵・離床センサー）" },
  { id: "h-other-family", cat: "その他", text: "家族が来たら医師に連絡" },
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
  const doc = "山本（専攻医）";
  const at = (day: DayOffset, time: string) => ({ day, time });
  return {
    "90010231": [
      { id: "sl-231-1", cat: "排泄", text: "トイレまで歩いてよい", start: at(-3, "10:00"), by: doc, at: at(-3, "10:00") },
      { id: "sl-231-2", cat: "観察", text: "咳と痰の性状を勤務ごとに記録", start: at(-3, "10:00"), by: doc, at: at(-3, "10:00") },
      { id: "sl-231-3", cat: "その他", text: "転倒に注意（ベッド柵・離床センサー）", start: { day: -3, time: "10:00" }, end: { day: -1 }, by: doc, at: { day: -3, time: "10:00" }, stop: { day: -2, time: "15:30", by: doc, reason: "歩行が安定した" } },
    ],
    "90010198": [
      { id: "sl-198-1", cat: "安静", text: "安静度：ベッド上、頭を上げてよい", start: at(-3, "10:00"), by: doc, at: at(-3, "10:00"), stop: { day: -1, time: "09:00", by: doc, reason: "息切れが落ち着いた" } },
      { id: "sl-198-2", cat: "安静", text: "安静度：病棟内フリー（息切れが出たら休む）", start: at(-1, "09:00"), by: doc, at: at(-1, "09:00") },
      { id: "sl-198-3", cat: "観察", text: "体重が前日より1kg以上増えたら報告", start: at(-3, "10:00"), by: doc, at: at(-3, "10:00") },
      { id: "sl-198-4", cat: "処置", text: "弾性ストッキングを着ける", start: at(-3, "10:00"), by: doc, at: at(-3, "10:00") },
    ],
    "90010260": [
      { id: "sl-260-1", cat: "排泄", text: "排尿のたびに尿量を記録、6時間以上ないときは報告", start: { day: -2, time: "11:00" }, end: { day: 0 }, by: doc, at: { day: -2, time: "11:00" } },
      { id: "sl-260-2", cat: "呼出基準", text: "腰背部痛が頓用で治まらないとき医師を呼ぶ", start: at(-2, "11:00"), by: doc, at: at(-2, "11:00") },
    ],
    "90010244": [
      { id: "sl-244-1", cat: "食事", text: "絶食（水分はよい）", start: at(-1, "09:30"), by: doc, at: at(-1, "09:30") },
      { id: "sl-244-2", cat: "処置", text: "吸引は必要時", start: at(-1, "09:30"), by: doc, at: at(-1, "09:30") },
      { id: "sl-244-3", cat: "観察", text: "SpO2 を持続モニターで見る", start: at(-1, "09:30"), by: doc, at: at(-1, "09:30") },
    ],
  };
}

export const INITIAL_LINE_IDS: Set<string> = new Set(Object.values(initialLines()).flat().map((l) => l.id));
