import { dietAt, MEALS, type DietOrder } from "./diet";

export type DietChangeRange = { kind: "once" } | { kind: "meals"; count: number } | { kind: "until-changed" };
export const mealNumber = (at: DietOrder["from"]) => at.day * 3 + MEALS.indexOf(at.meal);
export function afterMeals(at: DietOrder["from"], count: number): DietOrder["from"] {
  const n = mealNumber(at) + count;
  return { day: Math.floor(n / 3), meal: MEALS[((n % 3) + 3) % 3] };
}

/** Return additions only. Existing future instructions always remain in force. */
export function dietChangeOrders(existing: DietOrder[], base: DietOrder, at: DietOrder["from"], range: DietChangeRange, id: () => string): DietOrder[] {
  const count = range.kind === "once" ? 1 : range.kind === "meals" ? range.count : undefined;
  if (count !== undefined && (!Number.isSafeInteger(count) || count < 1)) throw new Error("回数は1以上の整数で入れてください。");
  const previous = dietAt(existing, base.patientId, at.day, at.meal);
  const { change: _change, ...content } = base;
  void _change;
  const edited: DietOrder = { ...content, id: id(), from: { ...at }, change: previous ? { previous, range } : undefined };
  if (count === undefined) return [edited];
  const end = afterMeals(at, count);
  // A scheduled instruction inside the range ends this change already.
  if (existing.some(o => o.patientId === base.patientId && mealNumber(o.from) > mealNumber(at) && mealNumber(o.from) <= mealNumber(end))) return [edited];
  const original = dietAt(existing, base.patientId, end.day, end.meal);
  if (!original) throw new Error("元に戻す食事の指示がありません。「ずっと」を選んでください。");
  const { change: _oldChange, ...restore } = original;
  void _oldChange;
  return [edited, { ...restore, id: id(), from: end, by: base.by, at: base.at }];
}

/** Undo is another order, so it follows the same draft / confirmation path. */
export function undoDietChange(existing: DietOrder[], changed: DietOrder, author: Pick<DietOrder, "by" | "at">, id: () => string): DietOrder[] {
  if (!existing.some(o => o.id === changed.id)) throw new Error("取り消す変更が見つかりません。");
  if (!changed.change) throw new Error("取り消せる変更がありません。");
  const { change: _change, ...previous } = changed.change.previous;
  void _change;
  const reverted = { ...previous, id: id(), from: changed.from, ...author };
  return [reverted];
}
