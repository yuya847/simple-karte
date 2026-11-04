// お気に入りの患者: the patients this person starred (☆) on the list or the patient bar, kept in this
// browser only, per person. A convenience for finding a chart quickly; it says nothing about the patient,
// and the official record of who opened what is the audit log.

export const FAVORITES_MAX = 50;

export const isFavorite = (ids: string[], id: string) => ids.includes(id);

/** Star or unstar a patient; a new star goes first. At most FAVORITES_MAX are kept (the oldest drop). */
export function toggleFavorite(ids: string[], id: string, max = FAVORITES_MAX): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [id, ...ids].slice(0, max);
}

/** Make saved (or broken) data a list of ids. */
export function normalizeFavorites(raw: unknown): string[] {
  return Array.isArray(raw) ? [...new Set(raw.filter((x): x is string => typeof x === "string" && x.length > 0))] : [];
}

const keyOf = (person: string) => `simple-karte:favorites:${person}`;

/** Read this person's stars from this browser; none when nothing is saved or it cannot be read. */
export function loadFavorites(person: string): string[] {
  try {
    const raw = window.localStorage.getItem(keyOf(person));
    return raw ? normalizeFavorites(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(person: string, ids: string[]) {
  try {
    window.localStorage.setItem(keyOf(person), JSON.stringify(ids));
  } catch {
    // Storage blocked: the stars last until the page is closed.
  }
}
