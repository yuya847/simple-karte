import { newItems, type CosignItem } from "./cosign";
import { isResident } from "./doctors";
import { lineLabel, type StandingLine } from "./standing-lines";
import { callText, prnText, type StandingOrders } from "./standing";
import { ruleText } from "./cond-orders";
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
  for (const [pid, versions] of Object.entries(fields)) versions.forEach((s, i) => add(pid, standingRef(pid, i + 1), s.by, s.at, `第${i + 1}版：${[s.rest, s.bath, s.vitals, s.weight, s.io, ...s.calls.map(callText), s.callConscious && "意識レベル低下時に連絡", ...s.prn.map(prnText), ...(s.conds ?? []).map(ruleText), s.other].filter(Boolean).join("／") || "指示なし（中止）"}`));
  for (const [pid, ls] of Object.entries(lines)) for (const l of ls) {
    add(pid, standingLineRef(pid, l.id), l.by, l.at, lineLabel(l));
    if (l.stop) add(pid, standingLineRef(pid, l.id, true), l.stop.by, l.stop, `中止：${lineLabel(l)}${l.stop.reason ? `（${l.stop.reason}）` : ""}`);
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
  return rows.map((r) => r.kind === "指示簿" && r.keys.some((k) => keys.has(`${r.patientId}|${k}`)) ? { ...r, flags: { ...r.flags, resident: "研修医の指示（確認待ち）" } } : r);
}
