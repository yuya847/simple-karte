// 入院患者一覧の「表示」: which columns the list shows and how tall its rows are. A per-viewer
// convenience kept in this browser only (per person); the list works without it and shows every
// column but 最新バイタル by default (turned on in 表示). Nothing here decides anything about a patient.

/** The columns that can be turned off (病室 and 氏名 are always shown). */
export type ListColumn = "shortSummary" | "todo" | "ageId" | "day" | "dpc" | "team" | "flags" | "vitals" | "upcoming" | "results" | "orders";

export const LIST_COLUMNS: { key: ListColumn; label: string }[] = [
  { key: "shortSummary", label: "サマリ" },
  { key: "todo", label: "ToDo" },
  { key: "ageId", label: "年齢性別・ID" },
  { key: "day", label: "入院日数" },
  { key: "dpc", label: "DPC" },
  { key: "team", label: "診療科・担当" },
  { key: "flags", label: "印（記録から）" },
  { key: "vitals", label: "最新バイタル" },
  { key: "upcoming", label: "このあと（今日）" },
  { key: "results", label: "新しい結果" },
  { key: "orders", label: "指示" },
];

export type RowDensity = "normal" | "compact";

export interface ListPrefs {
  /** The columns turned off (an unknown key is dropped; a new column is shown until turned off). */
  hidden: ListColumn[];
  density: RowDensity;
}

export const DEFAULT_LIST_PREFS: ListPrefs = { hidden: ["vitals"], density: "normal" };

export const showsColumn = (prefs: ListPrefs, key: ListColumn) => !prefs.hidden.includes(key);

/** Turn a column on or off. */
export function toggleColumn(prefs: ListPrefs, key: ListColumn): ListPrefs {
  return { ...prefs, hidden: prefs.hidden.includes(key) ? prefs.hidden.filter((k) => k !== key) : [...prefs.hidden, key] };
}

const KNOWN = new Set<string>(LIST_COLUMNS.map((c) => c.key));

/** Make saved (or broken) data a valid ListPrefs: unknown columns and values fall back to the default. */
export function normalizeListPrefs(raw: unknown): ListPrefs {
  if (!raw || typeof raw !== "object") return DEFAULT_LIST_PREFS;
  const o = raw as { hidden?: unknown; density?: unknown };
  const hidden = Array.isArray(o.hidden) ? (o.hidden.filter((k): k is ListColumn => typeof k === "string" && KNOWN.has(k)) as ListColumn[]) : DEFAULT_LIST_PREFS.hidden;
  return { hidden: [...new Set(hidden)], density: o.density === "compact" ? "compact" : "normal" };
}

const keyOf = (person: string) => `simple-karte:list-prefs:${person}`;

/** Read this person's choice from this browser; the default when nothing is saved or it cannot be read. */
export function loadListPrefs(person: string): ListPrefs {
  try {
    const raw = window.localStorage.getItem(keyOf(person));
    return raw ? normalizeListPrefs(JSON.parse(raw)) : DEFAULT_LIST_PREFS;
  } catch {
    return DEFAULT_LIST_PREFS;
  }
}

export function saveListPrefs(person: string, prefs: ListPrefs) {
  try {
    window.localStorage.setItem(keyOf(person), JSON.stringify(prefs));
  } catch {
    // Storage blocked: the choice lasts until the page is closed.
  }
}
