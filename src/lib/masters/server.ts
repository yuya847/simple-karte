// Server-side access to the official master data built by scripts/masters/build.mjs.
// Never import this from a client component: the files are large.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "src", "data", "generated");
const cache = new Map<string, unknown>();

export interface MasterFile {
  file: string;
  cols: number[] | null;
  rows: string[][];
}

export function loadMaster(key: "s" | "y" | "t" | "c" | "b" | "z"): MasterFile {
  if (!cache.has(key)) cache.set(key, JSON.parse(readFileSync(join(dir, `${key}.json`), "utf8")));
  return cache.get(key) as MasterFile;
}

export function loadTensuhyo(): Record<string, string[][]> {
  if (!cache.has("tensuhyo")) cache.set("tensuhyo", JSON.parse(readFileSync(join(dir, "tensuhyo.json"), "utf8")));
  return cache.get("tensuhyo") as Record<string, string[][]>;
}

export function masterMeta(): { builtAt: string; sources: { key: string; label: string; url: string; files: string[] }[] } {
  if (!cache.has("meta")) cache.set("meta", JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")));
  return cache.get("meta") as ReturnType<typeof masterMeta>;
}

/** Full-width alphanumerics and half-width kana fold together; hiragana is read as katakana. */
export function normalizeForSearch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/\s+/g, "");
}
