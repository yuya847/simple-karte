// 検体検査の実施料 for the items picked on the order screen, from the official 医科診療行為マスター
// (server side: the master is read there). Only the 実施料 of each item is added up — the 判断料 and
// the 採血料 depend on the month and the day, and belong to the claim (engine.ts). Items whose points
// depend on how many are drawn together (生化学的検査（Ⅰ）, 内分泌, 腫瘍マーカー, 出血・凝固) are
// bundled the way the 点数表 says. Computed by code; nothing is judged.

import { findLab, findSet } from "../master";
import { LAB_CODES } from "./codes";
import { OTHER_BUNDLES, seikagaku1Points } from "./engine";
import { shinryoItem } from "./master-items";

export interface LabPointLine {
  /** Lab code of the master (LAB-…), sets opened up. */
  code: string;
  label: string;
  /** 診療行為 names and the 点数表 section, e.g. "ＣＲＰ（D015）". */
  items: { code: string; name: string; kubun: string; points: number; bundle: string | null }[];
  /** Why there are no points for this item (billed elsewhere, or no code yet). */
  note?: string;
}

export interface LabBundle {
  group: string;
  name: string;
  count: number;
  /** Bundled points, or null when the count is below the bundle (then each item counts alone). */
  points: number | null;
}

export interface LabPoints {
  lines: LabPointLine[];
  /** Number of lab items (sets opened up, repeats removed). */
  items: number;
  /** 実施料 in points, bundles applied. */
  total: number;
  bundles: LabBundle[];
}

const BUNDLE_NAME: Record<string, string> = {
  "1": "生化学的検査（Ⅰ）（D007 の1〜8：5項目以上はまとめた点数）",
  ...Object.fromEntries(Object.entries(OTHER_BUNDLES).map(([g, b]) => [g, b.name])),
};

function bundlePoints(group: string, n: number): number | null {
  if (group === "1") return seikagaku1Points(n);
  return OTHER_BUNDLES[group]?.points(n) ?? null;
}

/** Lab codes of the picked items, sets opened up, each once, in the order picked. */
export function expandLabCodes(codes: string[]): string[] {
  const out: string[] = [];
  for (const c of codes) {
    const set = findSet(c);
    for (const x of set ? set.labCodes : [c]) if (!out.includes(x)) out.push(x);
  }
  return out;
}

export function labPoints(codes: string[]): LabPoints {
  const labs = expandLabCodes(codes);
  const seen = new Set<string>();
  const lines: LabPointLine[] = [];
  const perBundle = new Map<string, { count: number; alone: number }>();
  let total = 0;
  for (const code of labs) {
    const lab = findLab(code);
    const label = lab ? `${lab.abbr ?? lab.name}` : code;
    const masterCodes = LAB_CODES[code];
    if (!masterCodes) {
      lines.push({ code, label, items: [], note: "算定のコードがまだ結び付いていません" });
      continue;
    }
    if (masterCodes.length === 0) {
      const note = lab?.group === "薬物濃度" ? "特定薬剤治療管理料（B001-2）で算定" : code === "LAB-XMATCH" ? "輸血料の加算（K920）で算定" : "検体検査の実施料としては算定しない";
      lines.push({ code, label, items: [], note });
      continue;
    }
    const items: LabPointLine["items"] = [];
    for (const mc of masterCodes) {
      const it = shinryoItem(mc);
      if (!it) {
        items.push({ code: mc, name: mc, kubun: "", points: 0, bundle: null });
        continue;
      }
      const bundle = it.bundleGroup !== "0" && BUNDLE_NAME[it.bundleGroup] ? it.bundleGroup : null;
      items.push({ code: mc, name: it.name, kubun: it.kubun, points: it.points, bundle });
      // The same 診療行為 (e.g. 末梢血液一般 for WBC and Hb) counts once.
      if (seen.has(mc)) continue;
      seen.add(mc);
      if (bundle) {
        const b = perBundle.get(bundle) ?? { count: 0, alone: 0 };
        perBundle.set(bundle, { count: b.count + 1, alone: b.alone + it.points });
      } else total += it.points;
    }
    lines.push({ code, label, items });
  }
  const bundles: LabBundle[] = [];
  for (const [group, b] of perBundle) {
    const pts = bundlePoints(group, b.count);
    bundles.push({ group, name: BUNDLE_NAME[group] ?? `群${group}`, count: b.count, points: pts });
    total += pts ?? b.alone;
  }
  return { lines, items: labs.length, total, bundles };
}
