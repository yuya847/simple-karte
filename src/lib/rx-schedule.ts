/** 架空の病院の取り決め。曜日は日曜=0。 */
export const REGULAR_RX_DAYS: Record<string, number> = { "5階東": 2, "5階西": 4, "6階東": 3, "6階西": 5 };
export function nextRegularDay(ward: string, today: Date): Date | null {
  const weekday = REGULAR_RX_DAYS[ward.replace(/病棟$/, "")];
  if (weekday === undefined) return null;
  const next = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  next.setDate(next.getDate() + ((weekday - next.getDay() + 7) % 7 || 7));
  return next;
}

/** 日付だけの差。夏時間のある端末でも24時間で割った誤差を出さない。 */
export function regularDayOffset(ward: string, today: Date): number | null {
  const next = nextRegularDay(ward, today);
  return next ? (Date.UTC(next.getFullYear(), next.getMonth(), next.getDate()) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000 : null;
}
