// Chart notes: confirmed with who and when, and corrected only by adding a new version.
// The earlier versions stay, so anyone can see what was written first, what changed, who changed it,
// when and why (真正性: the record is not overwritten). 厚生労働省「医療情報システムの安全管理に関する
// ガイドライン 第7.0版」（令和8年6月）システム運用編 14章：入力者・確定者・日時を残し、確定後の更新は
// 履歴を残して前後を比べられ、更新の順序が分かること。

import type { DayOffset, FocusPart, NoteEntry, NoteVersion } from "./types";

export type { NoteVersion };

const KEYS = ["s", "o", "a", "p"] as const;

/** What a note holds: SOAP sections, foci with D・Act・R, a 経時記録, or one body of text. */
export type NoteContent = Pick<NoteEntry, "soap" | "text" | "focus" | "timeline">;

// 看護記録の形式: SOAP、フォーカスチャーティング（D・Act・R）、経時記録 — 富山市民病院 システム機能一覧
// 1.3(3)(5)（看護問題（SOAP）・フォーカス（D･Act･R）・経時記録の区分で記載し、絞り込む）、電子カルテ標準仕様研究会
// 標準仕様書 v1.0 1.03 看護記録 1（フォーカス事項に対して D/Act/R 形式）.
export const NOTE_FORM_SOURCES = [
  { name: "電子カルテ標準仕様研究会「電子カルテシステム標準仕様書 v1.0」1.03 看護記録 1 フォーカス＆SOAP", url: "http://hci-bc.com/pdf/StandardSpec_v1body_c.pdf" },
  { name: "富山市民病院 システム機能一覧 1.3 フォーカス及びSOAP (3)(5)", url: "https://www.tch.toyama.toyama.jp/tmh/02_3_siyousyo_system.pdf" },
];

const FOCUS_MARK = /^(D|Act|R)\)[ \t]?/i;
// "# 転倒" or, numbered by the note box, "#1 転倒": the number is the place in the note, not part of the title.
const TITLE_MARK = /^[ \t　]*[#＃][ \t]*(?:\d+(?:-\d+)*[.．)）:：]?(?=[ \t]|$))?[ \t]*/;
const TIME_LINE = /^(\d{1,2}:\d{2})[ \t]?(.*)$/;
const TIMELINE_HEAD = "【経時記録】";

const isFocusText = (text: string) => /^(D|Act|R)\)/im.test(text);
const isTimelineText = (text: string) => {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines[0] === TIMELINE_HEAD || (lines.length > 0 && lines.every((l) => TIME_LINE.test(l)));
};

function parseFocus(text: string): FocusPart[] {
  const out: (FocusPart & { at?: "title" | "d" | "act" | "r" })[] = [];
  const cur = () => out.at(-1) ?? (out.push({ title: "" }), out.at(-1)!);
  const add = (f: FocusPart & { at?: string }, k: "title" | "d" | "act" | "r", v: string) => {
    if (k === "title") f.title = f.title ? `${f.title} ${v}` : v;
    else f[k] = f[k] ? `${f[k]}\n${v}` : v;
  };
  for (const line of text.split("\n")) {
    if (TITLE_MARK.test(line)) {
      out.push({ title: line.replace(TITLE_MARK, "").trim(), at: "title" });
      continue;
    }
    const m = line.match(FOCUS_MARK);
    const f = cur();
    if (m) {
      const k = m[1].toLowerCase() === "d" ? "d" : m[1].toLowerCase() === "r" ? "r" : "act";
      f.at = k;
      add(f, k, line.slice(m[0].length));
    } else if (line.trim()) add(f, f.at ?? "title", line);
  }
  return out
    .map((f) => ({ title: f.title.trim(), ...(f.d?.trim() ? { d: f.d.trim() } : {}), ...(f.act?.trim() ? { act: f.act.trim() } : {}), ...(f.r?.trim() ? { r: f.r.trim() } : {}) }))
    .filter((f) => f.title || f.d || f.act || f.r);
}

function parseTimeline(text: string): NonNullable<NoteEntry["timeline"]> {
  const out: NonNullable<NoteEntry["timeline"]> = [];
  for (const line of text.split("\n")) {
    if (line.trim() === TIMELINE_HEAD) continue;
    const m = line.match(TIME_LINE);
    if (m) out.push({ time: m[1].padStart(5, "0"), text: m[2] });
    else if (line.trim()) {
      const last = out.at(-1);
      if (last) last.text = last.text ? `${last.text}\n${line.trim()}` : line.trim();
      else out.push({ time: "", text: line.trim() });
    }
  }
  return out.map((x) => ({ ...x, text: x.text.trim() })).filter((x) => x.text);
}

/**
 * "S) … O) … A) … P) …" becomes SOAP sections; "# …／D) …／Act) …／R) …" foci; "【経時記録】" and lines
 * starting with a clock time a 経時記録; anything else stays one body of text.
 */
export function parseNote(raw: string): NoteContent {
  const text = raw.replace(/\s+$/, "");
  if (isFocusText(text)) {
    const focus = parseFocus(text);
    return focus.length ? { focus } : { text: "" };
  }
  if (isTimelineText(text)) {
    const timeline = parseTimeline(text);
    return timeline.length ? { timeline } : { text: "" };
  }
  const marks = [...text.matchAll(/^([SOAP])\)\s?/gim)];
  if (marks.length === 0) return { text: text.trim() };
  const before = text.slice(0, marks[0].index).trim();
  const soap: NonNullable<NoteEntry["soap"]> = {};
  marks.forEach((m, i) => {
    const k = m[1].toLowerCase() as (typeof KEYS)[number];
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const body = text.slice(m.index! + m[0].length, end).trim();
    if (body) soap[k] = soap[k] ? `${soap[k]}\n${body}` : body;
  });
  if (before) soap.s = soap.s ? `${before}\n${soap.s}` : before;
  return Object.keys(soap).length ? { soap } : { text: "" };
}

/** The note back as editable text. */
export function noteText(n: NoteContent): string {
  if (n.soap) return KEYS.filter((k) => n.soap?.[k]).map((k) => `${k.toUpperCase()}) ${n.soap![k]}`).join("\n");
  if (n.focus) return n.focus.map((f) => [f.title && `# ${f.title}`, f.d && `D) ${f.d}`, f.act && `Act) ${f.act}`, f.r && `R) ${f.r}`].filter(Boolean).join("\n")).join("\n");
  if (n.timeline) return [TIMELINE_HEAD, ...n.timeline.map((x) => `${x.time} ${x.text}`.trim())].join("\n");
  return n.text ?? "";
}

/** Nothing written yet besides the frame. */
export function isBlankNote(raw: string): boolean {
  return !noteText(parseNote(raw)).trim();
}

// ---------- 記録の形式（看護） ----------

export const NOTE_FORMS = ["SOAP", "フォーカス（DAR）", "経時記録", "自由文"] as const;
export type NoteForm = (typeof NOTE_FORMS)[number];

/** The form a note is being written in (from its marks, so an empty frame counts too). */
export function noteFormOf(raw: string): NoteForm {
  if (isFocusText(raw) || (/^[#＃]/m.test(raw) && !/^[SOAP]\)/im.test(raw))) return "フォーカス（DAR）";
  const first = raw.split("\n").map((l) => l.trim()).find(Boolean);
  if (first === TIMELINE_HEAD || (first && isTimelineText(raw))) return "経時記録";
  if (/^[SOAP]\)/im.test(raw)) return "SOAP";
  return "自由文";
}

/** The empty frame of a form (a 経時記録 starts with the time now). */
export function formFrame(form: NoteForm, time: string): string {
  switch (form) {
    case "SOAP":
      return "S)\nO)\nA)\nP)\n";
    case "フォーカス（DAR）":
      return "# \nD) \nAct) \nR) \n";
    case "経時記録":
      return `${TIMELINE_HEAD}\n${time} \n`;
    case "自由文":
      return "";
  }
}

// ---------- 記録の部分で絞る（全・#・S・O・A・P・D・Act・R・経時） ----------

export const NOTE_PARTS = ["全", "#", "S", "O", "A", "P", "D", "Act", "R", "経時"] as const;
export type NotePart = (typeof NOTE_PARTS)[number];
export const NOTE_PART_TITLE: Record<NotePart, string> = {
  全: "すべての部分",
  "#": "フォーカス（#）の見出しだけ",
  S: "S（主観的情報）",
  O: "O（客観的情報）",
  A: "A（評価）",
  P: "P（計画）",
  D: "D（データ）",
  Act: "Act（行為）",
  R: "R（反応）",
  経時: "経時記録",
};

/** Whether a note has the part (全 = any note). */
export function hasPart(n: NoteContent, part: NotePart): boolean {
  switch (part) {
    case "全":
      return true;
    case "#":
      return !!n.focus?.some((f) => f.title);
    case "S":
    case "O":
    case "A":
    case "P":
      return !!n.soap?.[part.toLowerCase() as (typeof KEYS)[number]];
    case "D":
      return !!n.focus?.some((f) => f.d);
    case "Act":
      return !!n.focus?.some((f) => f.act);
    case "R":
      return !!n.focus?.some((f) => f.r);
    case "経時":
      return !!n.timeline?.length;
  }
}

/** A stable key for a note (notes from the stored record have no id). */
export const noteKey = (e: NoteEntry) => e.id ?? `${e.day}|${e.time}|${e.author}`;

/** All versions of a note, oldest first; the last one is what the chart shows. */
export function versionsOf(e: NoteEntry): NoteVersion[] {
  // The first version is dated when it was written (記載), which is not the 記録時刻 of a late note.
  return e.versions ?? [{ day: e.writtenAt?.day ?? e.day, time: e.writtenAt?.time ?? e.time, author: e.author, soap: e.soap, text: e.text, focus: e.focus, timeline: e.timeline }];
}

// ---------- 記録時刻・記載時刻・更新時刻 ----------
// 記録時刻 (when it happened) can be set earlier when writing late; when it was written and every update are
// kept as they were. 富山市民病院 システム機能一覧 1.3(10)(11)（ケアした時間と記録した時間の両方を記録、遡って
// 記録）, 沖縄県立南部医療センター 仕様書 B.13.12（カルテ日時・入力日時・入力者の履歴）, 電子カルテ標準仕様研究会
// 標準仕様書 v1.0 1.03 の 12（指示日時・実施日時・記載日時を各々独立して管理）.
export const NOTE_TIME_SOURCES = [
  { name: "富山市民病院 システム機能一覧 1.3 (10)(11)", url: "https://www.tch.toyama.toyama.jp/tmh/02_3_siyousyo_system.pdf" },
  { name: "沖縄県立南部医療センター・こども医療センター 基幹システム更新 仕様書 B.13.12", url: "https://nanbuweb.hosp.pref.okinawa.jp/userfiles/files/07-1_siyousyo_server.pdf" },
  { name: "電子カルテ標準仕様研究会「電子カルテシステム標準仕様書 v1.0」1.03 の 12", url: "http://hci-bc.com/pdf/StandardSpec_v1body_c.pdf" },
];

type Moment = { day: DayOffset; time: string };
const minutes = (t: string) => {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
const absMin = (a: Moment) => a.day * 1440 + minutes(a.time);
const pad = (n: number) => String(n).padStart(2, "0");

/** A clock that ran past midnight ("24:30" of day 0) as the next day's time (day 1, "00:30"). */
export function normalMoment(a: Moment): Moment {
  const m = absMin(a);
  if (!Number.isFinite(m)) return a;
  const day = Math.floor(m / 1440);
  const rest = m - day * 1440;
  return { day, time: `${pad(Math.floor(rest / 60))}:${pad(rest % 60)}` };
}

/** Why a 記録時刻 cannot be used (null when it can): not a time, later than now, or before the admission day. */
export function eventTimeProblem(at: Moment, now: Moment, admittedOn: DayOffset): string | null {
  if (!/^\d{1,2}:\d{2}$/.test(at.time) || minutes(at.time) >= 1440) return "時刻を「時:分」で入れてください。";
  if (absMin(at) > absMin(now)) return "これから先の時刻にはできません。";
  if (at.day < admittedOn) return "入院の日より前にはできません。";
  return null;
}

/** Days a late note may be dated on: from today back to the admission day, at most a week (newest first). */
export function eventDays(now: Moment, admittedOn: DayOffset): DayOffset[] {
  const top = normalMoment(now).day;
  const out: DayOffset[] = [];
  for (let d = top; d >= Math.max(admittedOn, top - 7); d--) out.push(d);
  return out;
}

/** 記録時刻・記載時刻・更新時刻 of a note; written late when 記載 is after 記録. */
export function noteTimes(e: NoteEntry): { event: Moment; written: Moment; updated: Moment | null; late: boolean } {
  const vs = versionsOf(e);
  const written = { day: vs[0].day, time: vs[0].time };
  const last = vs.at(-1)!;
  const late = !!e.writtenAt && absMin(normalMoment(e.writtenAt)) > absMin(normalMoment({ day: e.day, time: e.time }));
  return { event: { day: e.day, time: e.time }, written, updated: vs.length > 1 ? { day: last.day, time: last.time } : null, late };
}

/**
 * Anyone with a name may correct a confirmed note (ユーザーの決め、2026-11-04: 木下さんの記事を山本が直せるように).
 * Every version is kept with who corrected it, when and why, so the record stays traceable. Notes the
 * 検査室 writes from results are not corrected by hand.
 */
export const canRevise = (e: NoteEntry, me: string) => !!me && e.role !== "検査室";

/** A corrected note: same place in the record, new content, every earlier version kept. */
export function reviseNote(e: NoteEntry, raw: string, by: string, at: { day: DayOffset; time: string }, reason: string): NoteEntry {
  const next = parseNote(raw);
  const v: NoteVersion = { ...at, author: by, ...next, reason: reason.trim() };
  return { ...e, soap: next.soap, text: next.text, focus: next.focus, timeline: next.timeline, versions: [...versionsOf(e), v] };
}

export type DiffLine = { kind: "same" | "removed" | "added"; text: string };

/** Line-by-line difference between two versions (longest common subsequence). */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ kind: "removed", text: a[i++] });
    else out.push({ kind: "added", text: b[j++] });
  }
  while (i < n) out.push({ kind: "removed", text: a[i++] });
  while (j < m) out.push({ kind: "added", text: b[j++] });
  return out;
}

/** The note template for a role: SOAP for doctors, nurses and pharmacists; free text otherwise. */
export const noteTemplate = (role: string) => (role === "医師" || role === "看護師" || role === "薬剤師" ? "S)\nO)\nA)\nP)\n" : "");

/** The frame after a note is confirmed: a nurse goes on in the form just used; others start from their template. */
export const nextFrame = (role: string, confirmed: string, time: string) => (role === "看護師" ? formFrame(noteFormOf(confirmed), time) : noteTemplate(role));
