import type { Ban, KitchenDesk } from "./kitchen";
import type { DietOrder } from "./diet";
/** Keep registered bans first so their removal indices remain stable. Order bans are changed in the order. */
export function kitchenBans(desk: KitchenDesk, order?: DietOrder): Ban[] {
  const bans = order ? desk.bans[order.patientId] ?? [] : [];
  const foods = order?.prohibited?.split(/[、,・／\n]/).map(s => s.trim()).filter(Boolean) ?? [];
  return [...bans,...foods.filter(food => !bans.some(b => b.food === food)).map(food => ({food,why:"食事の指示",by:order!.by,at:order!.at}))];
}
