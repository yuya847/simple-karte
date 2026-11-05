import { fieldChangeText } from "./standing-history";
import { newItems, type CosignItem } from "./cosign";
import { isResident } from "./doctors";
import { lineLabel, linesFromFields, type StandingLine } from "./standing-lines";
import type { StandingOrders } from "./standing";
import type { TakeRow } from "./order-take";
import { changeKey } from "./worksheet";
export const standingRef = (pid: string, version: number) => `standing:${pid}:${version}`;
export const standingLineRef = (pid: string, id: string, stop = false) => `standing-line:${pid}:${id}${stop ? ":stop" : ""}`;
/** Rebuild missing queue entries from immutable standing-order history; confirmed entries stay intact. */
export function syncStandingCosign(items: CosignItem[], fields: Record<string, StandingOrders[]>, lines: Record<string, StandingLine[]>): CosignItem[] {
  const refs = new Set(items.map((i) => i.ref));
  const added: CosignItem[] = [];
  const add = (patientId: string, ref: string, by: string, at: StandingOrders["at"], text: string) => {
    if (!isResident(by) || refs.has(ref)) return;
    refs.add(ref);
    added.push(...newItems({ patientId, by, at }, [{ ref, kind: "指示簿", text }], () => ref));
  };
  for (const [pid, versions] of Object.entries(fields)) versions.forEach((s, i) => add(pid, standingRef(pid, i + 1), s.by, s.at, `第${i + 1}版：${fieldChangeText(versions.slice(0, i), s)}`));
  for (const [pid, versions] of Object.entries(fields)) for (const l of linesFromFields(versions)) if (l.stop) add(pid, standingLineRef(pid, `standing:${pid}:${l.id}`, true), l.stop.by, l.stop, `${l.stop.kind ?? "中止"}：${lineLabel(l)}`);
  for (const [pid, ls] of Object.entries(lines)) for (const l of ls) {
    add(pid, standingLineRef(pid, l.id), l.by, l.at, `${l.changedFrom ? "【変】変更：" : ""}${lineLabel(l)}`);
    if (l.stop) add(pid, standingLineRef(pid, l.id, true), l.stop.by, l.stop, `${l.stop.kind ?? "中止"}：${lineLabel(l)}${l.stop.reason ? `（${l.stop.reason}）` : ""}`);
  }
  return added.length ? [...items, ...added] : items;
}
/** Marking a pending order never prevents 指示受け. */
export function markStandingTake(rows: TakeRow[], items: CosignItem[]): TakeRow[] {
  const keys = new Set(items.filter((i) => i.kind === "指示簿" && !i.confirmed).map((i) => {
    const prefix = `standing-line:${i.patientId}:`;
    if (!i.ref.startsWith(prefix)) return "";
    const id = i.ref.slice(prefix.length);
    return `${i.patientId}|${changeKey(id.endsWith(":stop") ? id.slice(0, -5) : id, id.endsWith(":stop") ? "中止" : "新規")}`;
  }));
  const fieldPrefixes = items.filter((i) => i.kind === "指示簿" && !i.confirmed && i.ref.startsWith(`standing:${i.patientId}:`)).map((i) => {
    const version = Number(i.ref.slice(`standing:${i.patientId}:`.length));
    return `standing:${i.patientId}:fld-${version - 1}-`;
  });
  return rows.map((r) => (r.kind === "指示簿" || r.type === "指示簿") && r.keys.some((k) => keys.has(`${r.patientId}|${k}`) || fieldPrefixes.some((prefix) => k.startsWith(prefix))) ? { ...r, flags: { ...r.flags, resident: "研修医の指示（確認待ち）" } } : r);
}
