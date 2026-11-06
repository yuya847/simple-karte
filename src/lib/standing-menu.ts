import type { StandingLine } from "./standing-lines";
export const STANDING_MENU = ["指示を変更", "終了", "この指示の下に追加", "新しい指示を追加", "テキストとしてコピー"] as const;
export function standingMenuEnabled(line: StandingLine, canOrder: boolean): boolean[] {
  return [canOrder && !line.stop && !line.changed && line.start.day <= 0, canOrder && !line.stop && !line.changed, canOrder, canOrder, true];
}
