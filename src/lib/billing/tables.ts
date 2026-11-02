// The machine-readable rule tables of the 医科電子点数表 (支払基金), applied as written.
// Table semantics follow the 医科電子点数表の活用手引き (令和8年度版) §3–§5.
// Where the guide leaves something undefined (e.g. which of two to keep for 背反区分3),
// the engine does not decide: it reports the choice to a person.

import { loadTensuhyo } from "../masters/server";

export type HaihanWindow = "day" | "month" | "same" | "week";

interface Indexed {
  aux: Map<string, string[]>;
  hokatsu: Map<string, Map<string, boolean>>;
  haihan: Record<HaihanWindow, Map<string, Map<string, { kubun: 1 | 2 | 3; tokurei: boolean }>>>;
  nyuin: Map<string, Map<string, number>>;
  kaisu: Map<string, { unit: string; limit: number; tokurei: boolean }[]>;
}

let index: Indexed | null = null;

function tables(): Indexed {
  if (index) return index;
  const t = loadTensuhyo() as unknown as {
    aux: Record<string, string[]>;
    hokatsu: Record<string, [string, string][]>;
    haihan: Record<HaihanWindow, [string, string, string, string][]>;
    nyuin: [string, string, string][];
    kaisu: [string, string, string, string][];
  };
  const haihan = { day: new Map(), month: new Map(), same: new Map(), week: new Map() } as Indexed["haihan"];
  for (const w of Object.keys(haihan) as HaihanWindow[]) {
    for (const [a, b, kubun, tokurei] of t.haihan[w]) {
      if (!haihan[w].has(a)) haihan[w].set(a, new Map());
      haihan[w].get(a)!.set(b, { kubun: Number(kubun) as 1 | 2 | 3, tokurei: tokurei === "1" });
    }
  }
  const nyuin = new Map<string, Map<string, number>>();
  for (const [group, code, ident] of t.nyuin) {
    if (!nyuin.has(group)) nyuin.set(group, new Map());
    nyuin.get(group)!.set(code, Number(ident));
  }
  const kaisu = new Map<string, { unit: string; limit: number; tokurei: boolean }[]>();
  for (const [code, unit, limit, tokurei] of t.kaisu) {
    if (!kaisu.has(code)) kaisu.set(code, []);
    kaisu.get(code)!.push({ unit, limit: Number(limit), tokurei: tokurei === "1" });
  }
  index = {
    aux: new Map(Object.entries(t.aux)),
    hokatsu: new Map(Object.entries(t.hokatsu).map(([g, rows]) => [g, new Map(rows.map(([c, tk]) => [c, tk === "1"]))])),
    haihan,
    nyuin,
    kaisu,
  };
  return index;
}

/** 包括単位: 1 = 1日につき, 2 = 同一月内, 3 = 同時, 5 = 手術前1週間, 6 = 1手術につき. */
export type HokatsuUnit = "1" | "2" | "3" | "5" | "6";

/** Groups a parent code absorbs, with the period of absorption. */
export function hokatsuGroups(parent: string): { unit: HokatsuUnit; group: string }[] {
  const a = tables().aux.get(parent);
  if (!a) return [];
  const out: { unit: HokatsuUnit; group: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const unit = a[i * 2];
    const group = a[i * 2 + 1];
    if (unit !== "0" && group !== "0") out.push({ unit: unit as HokatsuUnit, group });
  }
  return out;
}

/** Whether `child` is absorbed by `group`, and whether the row carries a 特例条件. */
export function hokatsuChild(group: string, child: string): { tokurei: boolean } | null {
  const g = tables().hokatsu.get(group);
  if (!g?.has(child)) return null;
  return { tokurei: g.get(child)! };
}

const WINDOW_FLAG: Record<HaihanWindow, number> = { day: 6, month: 7, same: 8, week: 9 };

/** 背反 between two codes in a period: 1 = keep a, 2 = keep b, 3 = one of them (a person chooses). */
export function haihan(window: HaihanWindow, a: string, b: string): { kubun: 1 | 2 | 3; tokurei: boolean } | null {
  const t = tables();
  if (t.aux.get(a)?.[WINDOW_FLAG[window]] !== "1") return null;
  return t.haihan[window].get(a)?.get(b) ?? null;
}

/** 入院基本料識別 of an 入院料 code ("000" = none). */
export function nyuinGroup(baseCode: string): string {
  return tables().aux.get(baseCode)?.[10] ?? "000";
}

/** 加算 that may be added to this 入院料, with their 加算識別 (same 識別 = only one of them). */
export function allowedKasan(baseCode: string): Map<string, number> {
  const g = nyuinGroup(baseCode);
  return g === "000" ? new Map() : (tables().nyuin.get(g) ?? new Map());
}

/** 算定回数 limits. Units are 付表1 codes (121 日, 131 月, 133 入院中, 132 入院初日, 138 週 …). */
export function kaisuLimits(code: string): { unit: string; limit: number; tokurei: boolean }[] {
  return tables().kaisu.get(code) ?? [];
}

export const KAISU_UNIT_NAME: Record<string, string> = {
  "121": "日",
  "131": "月",
  "132": "入院初日",
  "133": "入院中",
  "134": "退院時",
  "135": "初回",
  "138": "週",
  "141": "一連",
  "53": "患者当り",
  "28": "単位",
};
