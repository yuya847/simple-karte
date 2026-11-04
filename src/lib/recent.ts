// 最近開いた患者: the charts this person opened, newest first, kept in this browser (a per-viewer
// convenience; the audit log keeps the official record of who opened what).

export interface RecentOpen {
  id: string;
  /** Clock time "HH:MM" it was last opened (day 0 = today, -1 = earlier). */
  time: string;
  day: number;
}

export const RECENT_MAX = 20;

/** Put the patient first (moving it up when already in the list) and keep at most RECENT_MAX. */
export function pushRecent(list: RecentOpen[], id: string, day: number, time: string, max = RECENT_MAX): RecentOpen[] {
  return [{ id, day, time }, ...list.filter((r) => r.id !== id)].slice(0, max);
}

const keyOf = (person: string) => `simple-karte:recent:${person}`;

/** Read the list saved for this person; entries from earlier days count as day -1 (前日以前). */
export function loadRecent(person: string, today: string): RecentOpen[] {
  try {
    const raw = window.localStorage.getItem(keyOf(person));
    const o = raw ? (JSON.parse(raw) as { date?: string; list?: RecentOpen[] }) : null;
    if (!o || !Array.isArray(o.list)) return [];
    return o.date === today ? o.list : o.list.map((r) => ({ ...r, day: -1 }));
  } catch {
    return [];
  }
}

export function saveRecent(person: string, today: string, list: RecentOpen[]) {
  try {
    window.localStorage.setItem(keyOf(person), JSON.stringify({ date: today, list }));
  } catch {
    // Storage blocked: the list lasts until the page is closed.
  }
}
