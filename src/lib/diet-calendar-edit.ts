import { dietAt, dietLabel, type DietOrder } from "./diet";
import type { DietDraft } from "./drafts";

export type DietScope = "from" | "day";
/** Keep existing future orders; for one day, restore the original diet at the next breakfast. */
export function calendarDietOrders(existing: DietOrder[], edited: DietOrder, scope: DietScope): DietOrder[] {
  if (scope === "from") return [edited];
  const from = { day: edited.from.day + 1, meal: "朝" as const };
  if (existing.some((o) => o.patientId === edited.patientId && o.from.day === from.day && o.from.meal === from.meal)) return [edited];
  const original = dietAt(existing, edited.patientId, from.day, from.meal);
  if (!original) throw new Error("翌朝に戻す食事の指示がありません。「この食事から」を選んでください。");
  return [edited, { ...original, id: `${edited.id}-restore`, from, by: edited.by, at: edited.at }];
}

export function calendarDietDrafts(orders: DietOrder[], id: () => string): DietDraft[] {
  return orders.map((o) => {
    const { id: _id, by: _by, at: _at, ...diet } = o;
    void _id; void _by; void _at;
    return { id: id(), kind: "diet", origin: "manual", sourceText: `食事：${dietLabel(o)}（${o.from.day === 0 ? "今日" : `${o.from.day}日後`}の${o.from.meal}食から）`, comment: null, diet };
  });
}
