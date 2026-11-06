// マスタ管理: the hospital's own fields of the drug, lab and procedure masters — 採用 (adopted), 院内名
// (the name used in this hospital), 表示順 (order in the pickers) and 中止 (no new orders). The masters
// themselves stay in the TS files (src/lib/master.ts, procedures.ts); a change is kept as a line of
// history in the day's records (the workspace) and folded over the defaults here, in code.
//
// 標準仕様書 様式1 項番161-165 asks that the masters can be registered and changed. Who changes which
// master is the fictional hospital's rule (架空の病院の取り決め, roles.ts "master.*").

import { useSyncExternalStore } from "react";
import { DRUGS, LAB_TESTS, ORAL_DRUGS } from "./master";
import { PROCEDURES } from "./procedures";
import type { Draft, Issue } from "./drafts";

export const MASTER_SOURCE = {
  label: "厚生労働省・デジタル庁「中小病院向け電子カルテ及びレセプトコンピュータ標準仕様書（基本要件）第1.0版」第1章 別紙様式1 項番161〜165（マスタ管理）",
  url: "https://www.mhlw.go.jp/content/10800000/001683680.pdf",
};

export type MasterKind = "注射薬" | "内服薬" | "検体検査" | "処置";
export const MASTER_KINDS: MasterKind[] = ["注射薬", "内服薬", "検体検査", "処置"];

/** The fields a hospital sets for itself. */
export interface LocalFields {
  adopted: boolean;
  /** "" = use the standard name. */
  localName: string;
  /** Smaller first in the pickers. The defaults go 10, 20, 30… in the master's order, so an item can be put between two. */
  order: number;
  stopped: boolean;
}
export type FieldKey = keyof LocalFields;
export const FIELD_LABEL: Record<FieldKey, string> = { adopted: "採用", localName: "院内名", order: "表示順", stopped: "中止" };

/** One line of the history. `reset` puts one item (or every item, code "*") back to the defaults. */
export interface MasterChange {
  id: string;
  kind: MasterKind | "*";
  code: string;
  field: FieldKey | "reset";
  value?: boolean | string | number;
  /** What it was and what it became, as shown in the history. */
  before: string;
  after: string;
  reason: string;
  by: string;
  role: string;
  at: { day: number; time: string };
}

/** One item of a master as the screen lists it. */
export interface MasterRow {
  kind: MasterKind;
  code: string;
  /** The standard name (from the master file). */
  name: string;
  /** Package, strength or group. */
  sub: string;
  aliases: string[];
  /** The place in the master file, 1… (the default 表示順 is ten times it). */
  base: number;
}

const rowsOf = (kind: MasterKind): MasterRow[] => {
  const list =
    kind === "注射薬"
      ? DRUGS.map((d) => ({ code: d.code, name: d.name, sub: `${d.package}${d.chemo ? "（抗がん薬：レジメンから）" : ""}`, aliases: d.aliases }))
      : kind === "内服薬"
        ? ORAL_DRUGS.map((d) => ({ code: d.code, name: d.name, sub: `${d.strength}／${d.unit}`, aliases: d.aliases }))
        : kind === "検体検査"
          ? LAB_TESTS.map((t) => ({ code: t.code, name: t.abbr ? `${t.abbr}（${t.name}）` : t.name, sub: t.group ?? t.specimen, aliases: t.aliases }))
          : PROCEDURES.map((p) => ({ code: p.code, name: p.name, sub: p.continuous ? "継続" : "", aliases: p.aliases }));
  return list.map((x, i) => ({ ...x, kind, base: i + 1 }));
};

const ROWS: Record<MasterKind, MasterRow[]> = { 注射薬: rowsOf("注射薬"), 内服薬: rowsOf("内服薬"), 検体検査: rowsOf("検体検査"), 処置: rowsOf("処置") };
export const masterRows = (kind: MasterKind): MasterRow[] => ROWS[kind];
export const findRow = (kind: MasterKind, code: string) => ROWS[kind].find((r) => r.code === code);

export const defaultsOf = (kind: MasterKind, code: string): LocalFields => ({ adopted: true, localName: "", order: (findRow(kind, code)?.base ?? 999) * 10, stopped: false });

const keyOf = (kind: MasterKind, code: string) => `${kind}|${code}`;
export type Overrides = ReadonlyMap<string, LocalFields>;
export const NO_OVERRIDES: Overrides = new Map();

/** Fold the history over the defaults: only the items that differ from them are in the map. */
export function foldChanges(log: readonly MasterChange[]): Overrides {
  const out = new Map<string, LocalFields>();
  for (const c of log) {
    if (c.field === "reset") {
      if (c.kind === "*") out.clear();
      else if (c.code === "*") {
        for (const k of [...out.keys()]) if (k.startsWith(`${c.kind}|`)) out.delete(k);
      }
      else out.delete(keyOf(c.kind, c.code));
      continue;
    }
    if (c.kind === "*") continue;
    const k = keyOf(c.kind, c.code);
    const cur = out.get(k) ?? defaultsOf(c.kind, c.code);
    const next = { ...cur, [c.field]: c.value } as LocalFields;
    const d = defaultsOf(c.kind, c.code);
    if (next.adopted === d.adopted && next.localName === d.localName && next.order === d.order && next.stopped === d.stopped) out.delete(k);
    else out.set(k, next);
  }
  return out;
}

export const fieldsOf = (ov: Overrides, kind: MasterKind, code: string): LocalFields => ov.get(keyOf(kind, code)) ?? defaultsOf(kind, code);

/** May it be ordered now: 採用 and not 中止. */
export const orderable = (ov: Overrides, kind: MasterKind, code: string) => {
  const f = fieldsOf(ov, kind, code);
  return f.adopted && !f.stopped;
};

/** The items the pickers show: 採用 and not 中止, in 表示順 (ties keep the master's order). */
export function pickable<T extends { code: string }>(kind: MasterKind, items: readonly T[], ov: Overrides): T[] {
  if (!ov.size) return [...items];
  return items
    .map((x, i) => ({ x, i, f: fieldsOf(ov, kind, x.code) }))
    .filter((y) => y.f.adopted && !y.f.stopped)
    .sort((a, b) => a.f.order - b.f.order || a.i - b.i)
    .map((y) => y.x);
}

/** The name the pickers show: 院内名 when one is set. */
export const nameIn = (ov: Overrides, kind: MasterKind, code: string, standard: string) => fieldsOf(ov, kind, code).localName || standard;

// ---------------------------------------------------------------------------
// A change, checked before it is added
// ---------------------------------------------------------------------------

export const valueText = (field: FieldKey, v: LocalFields[FieldKey]): string =>
  field === "adopted" ? (v ? "採用" : "非採用") : field === "stopped" ? (v ? "中止" : "使用中") : field === "localName" ? (v ? String(v) : "（標準の名前）") : String(v);

export type FieldEdit = Partial<LocalFields>;

/** Why the edit cannot be kept, or null. 院内名 up to 40 characters, 表示順 1〜9999, a reason always. */
export function editProblem(edit: FieldEdit, reason: string): string | null {
  if (edit.localName !== undefined && edit.localName.trim().length > 40) return "院内名は40文字までです。";
  if (edit.order !== undefined && !(Number.isInteger(edit.order) && edit.order >= 1 && edit.order <= 9999)) return "表示順は1〜9999の整数です。";
  if (!reason.trim()) return "変える理由を書いてください（履歴に残ります）。";
  return null;
}

/** The lines of history an edit makes: one per field that changes (none when nothing changes). */
export function changesFor(
  ov: Overrides,
  kind: MasterKind,
  code: string,
  edit: FieldEdit,
  meta: { reason: string; by: string; role: string; at: { day: number; time: string } },
  newId: () => string,
): MasterChange[] {
  const cur = fieldsOf(ov, kind, code);
  const out: MasterChange[] = [];
  for (const field of ["adopted", "localName", "order", "stopped"] as FieldKey[]) {
    if (edit[field] === undefined) continue;
    const value = field === "localName" ? String(edit.localName).trim() : edit[field]!;
    if (value === cur[field]) continue;
    out.push({ id: newId(), kind, code, field, value, before: valueText(field, cur[field]), after: valueText(field, value), reason: meta.reason.trim(), by: meta.by, role: meta.role, at: meta.at });
  }
  return out;
}

/** A line that puts one item, one master (code "*") or everything (kind "*") back to the defaults. */
export const resetChange = (kind: MasterKind | "*", code: string, meta: { reason: string; by: string; role: string; at: { day: number; time: string } }, newId: () => string): MasterChange => ({
  id: newId(),
  kind,
  code,
  field: "reset",
  before: "",
  after: "初めの状態",
  reason: meta.reason.trim(),
  by: meta.by,
  role: meta.role,
  at: meta.at,
});

// ---------------------------------------------------------------------------
// Orders: a draft with an item that is 中止 or 非採用 cannot be confirmed
// ---------------------------------------------------------------------------

const codesOf = (d: Draft): { kind: MasterKind; code: string }[] => {
  switch (d.kind) {
    case "injection":
      return d.items.flatMap((i) => (i.drugCode ? [{ kind: "注射薬" as const, code: i.drugCode }] : []));
    case "prescription":
      return d.items.flatMap((i) => (i.drugCode ? [{ kind: "内服薬" as const, code: i.drugCode }] : []));
    case "lab":
      return d.tests.flatMap((t) => (t.code ? [{ kind: "検体検査" as const, code: t.code }] : []));
    case "procedure":
      return d.code ? [{ kind: "処置", code: d.code }] : [];
    default:
      return [];
  }
};

/** The last change of an item's field, for the message. */
const lastChange = (log: readonly MasterChange[], kind: MasterKind, code: string, field: FieldKey) => [...log].reverse().find((c) => c.kind === kind && c.code === code && c.field === field);

/**
 * 中止・非採用 in マスタ管理: no new order (架空の病院の取り決め). The message says who changed it, when and why;
 * the doctor removes the draft or asks the department to change the master back.
 */
export function masterIssues(d: Draft, ov: Overrides, log: readonly MasterChange[] = []): Issue[] {
  if (!ov.size) return [];
  const out: Issue[] = [];
  for (const { kind, code } of codesOf(d)) {
    const f = fieldsOf(ov, kind, code);
    if (f.adopted && !f.stopped) continue;
    const field: FieldKey = f.stopped ? "stopped" : "adopted";
    const c = lastChange(log, kind, code, field);
    const name = f.localName || findRow(kind, code)?.name || code;
    out.push({
      key: `master-${kind}-${code}`,
      level: "stop",
      title: "マスタ",
      message: `${name}は院内のマスタで「${f.stopped ? "中止" : "非採用"}」です${c ? `（${c.by} ${c.at.time}：${c.reason}）` : ""}。新しくはオーダできません。ほかの品目にするか、マスタ管理で戻してもらってください。`,
      choices: [{ label: "この下書きを消す", remove: true }],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The history of this page (saved with the day's records), shared by the pickers and the checks
// ---------------------------------------------------------------------------

let log: MasterChange[] = [];
let folded: Overrides = NO_OVERRIDES;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const isChange = (v: unknown): v is MasterChange => {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  const kindOk = c.kind === "*" || MASTER_KINDS.includes(c.kind as MasterKind);
  const fieldOk = c.field === "reset" || c.field === "adopted" || c.field === "localName" || c.field === "order" || c.field === "stopped";
  const at = c.at as Record<string, unknown> | undefined;
  return kindOk && fieldOk && typeof c.id === "string" && typeof c.code === "string" && typeof c.reason === "string" && typeof c.by === "string" && !!at && typeof at.time === "string" && typeof at.day === "number";
};

export const masterLog = () => log;
export const masterOverrides = () => folded;

/** Add lines of history (they are never changed or removed; a reset is a line too). */
export function addMasterChanges(cs: MasterChange[]): void {
  if (!cs.length) return;
  log = [...log, ...cs];
  folded = foldChanges(log);
  emit();
}

/** The history read back from the day's records when the page opens (lines that do not fit are left out). */
export function restoreMasterLog(saved: unknown): void {
  if (!Array.isArray(saved)) return;
  log = [...saved.filter(isChange), ...log.filter((c) => !saved.some((s) => (s as MasterChange)?.id === c.id))];
  folded = foldChanges(log);
  emit();
}

// The history only ever changes in the browser (it is read back there), so the server's snapshot is the same store.
/** The history, for the screen and for saving. */
export const useMasterLog = (): MasterChange[] => useSyncExternalStore(subscribe, masterLog, masterLog);
/** The fields that differ from the defaults, for the pickers. */
export const useMasterLocal = (): Overrides => useSyncExternalStore(subscribe, masterOverrides, masterOverrides);
