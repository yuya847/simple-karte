import type { LineDevice } from "./types";
export const LINE_DAYS_HINT = "架空の病院の取り決め：挿入日を1日目として暦日で数えます。7日以上の太字は印だけです。";
export function lineDays(line: LineDevice, today: number): string {
  if (line.insertedAt.day > today) return "未挿入";
  const removed = line.removedAt && line.removedAt.day <= today;
  const days = (removed ? line.removedAt!.day : today)-line.insertedAt.day+1;
  return removed ? `抜去（${days} 日間）` : `${days}日目`;
}
