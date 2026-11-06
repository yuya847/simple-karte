import { dietLabel, type DietOrder } from "./diet";
import { dietChangeOrders, mealNumber } from "./diet-change";
import type { DietDraft } from "./drafts";

export type DietScope = "from" | "day";
/** Keep existing future orders; for one day, restore the original diet at the next breakfast. */
export function calendarDietOrders(existing: DietOrder[], edited: DietOrder, scope: DietScope): DietOrder[] {
  if (scope === "from") return [edited];
  try {
    const orders = dietChangeOrders(existing, edited, edited.from, { kind: "meals", count: (edited.from.day + 1) * 3 - mealNumber(edited.from) }, () => `${edited.id}-restore`);
    return [edited, ...orders.slice(1)];
  } catch {
    throw new Error("翌朝に戻す食事の指示がありません。「この食事から」を選んでください。");
  }
}

export function calendarDietDrafts(orders: DietOrder[], id: () => string): DietDraft[] {
  return orders.map((o) => {
    const { id: _id, by: _by, at: _at, ...diet } = o;
    void _id; void _by; void _at;
    return { id: id(), kind: "diet", origin: "manual", sourceText: `食事：${dietLabel(o)}（${o.from.day === 0 ? "今日" : `${o.from.day}日後`}の${o.from.meal}食から）`, comment: null, diet };
  });
}
