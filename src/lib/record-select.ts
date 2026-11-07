// 囲んで選ぶ（経過と下書きの欄）: the box from where the mouse was pressed to where it is now, the cards it
// touches, adding and taking off one card with ⌘/Ctrl/Shift, scrolling at the edge of the list, and the chosen
// records in the order of the record's time. Pure functions; the screens measure the cards and call these.

export interface Point {
  x: number;
  y: number;
}

/** A rectangle in the list's own coordinates (scrolling included). */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The box between two points, whichever way the mouse went. */
export const boxFrom = (a: Point, b: Point): Box => ({
  left: Math.min(a.x, b.x),
  top: Math.min(a.y, b.y),
  right: Math.max(a.x, b.x),
  bottom: Math.max(a.y, b.y),
});

/** Two boxes share some area (touching edges do not count). */
export const overlaps = (a: Box, b: Box): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** The keys of the cards the box touches, in the order the cards are given, each once. */
export function hitKeys(box: Box, cards: { key: string; box: Box }[]): string[] {
  const out: string[] = [];
  for (const c of cards) if (overlaps(box, c.box) && !out.includes(c.key)) out.push(c.key);
  return out;
}

/** What is chosen while the box is drawn: the cards in it, or (⌘/Ctrl/Shift held) those added to what was chosen before. */
export function boxSelection(before: string[], hits: string[], add: boolean): string[] {
  if (!add) return hits;
  return [...before, ...hits.filter((k) => !before.includes(k))];
}

/** ⌘/Ctrl/Shift + click: the card is added, or taken off when it was chosen. */
export const toggleKey = (list: string[], key: string): string[] => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

export const sameKeys = (a: string[], b: string[]): boolean => a.length === b.length && a.every((k, i) => k === b[i]);

/** The mouse went far enough from where it was pressed to be a box, not a click. */
export const movedFrom = (a: Point, b: Point, min = 4): boolean => Math.abs(a.x - b.x) > min || Math.abs(a.y - b.y) > min;

/**
 * How far to scroll the list in one frame while the box is drawn: up near (or above) the top edge, down near (or
 * below) the bottom edge, faster the closer to the edge; 0 in between.
 */
export function edgeScroll(y: number, top: number, bottom: number, edge = 28, max = 18): number {
  if (y < top + edge) return -Math.round(max * Math.min(1, (top + edge - y) / edge));
  if (y > bottom - edge) return Math.round(max * Math.min(1, (y - (bottom - edge)) / edge));
  return 0;
}

/** Records by the time of the record (day, then "HH:MM"), oldest first; the same time keeps the order given. */
export function inTimeOrder<T extends { day: number; time: string }>(items: T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => a.item.day - b.item.day || a.item.time.localeCompare(b.item.time) || a.i - b.i)
    .map((x) => x.item);
}
