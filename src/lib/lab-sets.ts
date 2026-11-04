// The sets on the left of the lab order screen: 基本セット (the hospital's sets and the 生化学 set) and
// 科別セット (one list per department). Pressing a set picks its items one by one — the picked list
// shows items, never a set code — and pressing it again takes those items out. Which items a set
// holds is the fictional hospital's rule; the doctor picks, nothing is suggested.

import { LAB_TESTS, ORDER_SETS, findLab, findSet } from "./master";

export interface LabSet {
  code: string;
  name: string;
  /** Single lab items (LAB-…), sets and panels opened up. */
  codes: string[];
}

export interface DeptSets {
  dept: string;
  sets: LabSet[];
}

/** The single item that reports exactly this analyte (TP → LAB-TP), if the master has one. */
function itemOfAnalyte(analyte: string): string | null {
  const t = LAB_TESTS.find((x) => !x.hidden && x.group !== "セット" && x.contains?.length === 1 && x.contains[0] === analyte);
  return t?.code ?? null;
}

/**
 * Open a code up into single items: a hospital set (SET-…) into its items, a panel of the master
 * (生化学セット, the hidden PT・APTT pair) into the item of each analyte. An item that reports several
 * analytes but is ordered as one test (血算, 動脈血ガス) stays as it is.
 */
export function singleItemsOf(code: string): string[] {
  const set = findSet(code);
  if (set) return [...new Set(set.labCodes.flatMap(singleItemsOf))];
  const t = findLab(code);
  if (t && (t.group === "セット" || t.hidden) && t.contains?.length) {
    const items = t.contains.map(itemOfAnalyte);
    if (items.every((c) => c !== null)) return [...new Set(items as string[])];
  }
  return [code];
}

const set = (code: string, name: string, codes: string[]): LabSet => ({ code, name, codes: [...new Set(codes.flatMap(singleItemsOf))] });

/** The routine chemistry the ward draws (TP … Glu), as single items. */
const CHEM = singleItemsOf("LAB-CHEM");
const LIVER = ["LAB-AST", "LAB-ALT", "LAB-LD", "LAB-ALP", "LAB-GGT", "LAB-TBIL", "LAB-DBIL", "LAB-CHE"];
const RENAL_LYTES = ["LAB-BUN", "LAB-CRE", "LAB-NA", "LAB-K", "LAB-CL"];
const HEPATITIS = ["LAB-HBSAG", "LAB-HCVAB", "LAB-HIV", "LAB-TPAB", "LAB-RPR"];

/** 基本セット: the hospital's order sets (ORDER_SETS) and the 生化学 set, opened up to single items. */
export const BASIC_SETS: LabSet[] = [
  ...ORDER_SETS.map((s) => set(s.code, s.name, s.labCodes)),
  ...LAB_TESTS.filter((t) => t.group === "セット" && !t.hidden).map((t) => set(t.code, t.abbr ?? t.name, [t.code])),
];

/** 科別セット: one list per department. The fictional hospital's rule (架空の病院の取り決め). */
export const DEPT_SETS: DeptSets[] = [
  {
    dept: "総合診療科",
    sets: [
      set("DSET-GM-FEVER", "発熱セット", ["LAB-CBC", "LAB-DIFF", "LAB-CRP", "LAB-PCT", ...CHEM, "LAB-BCX", "LAB-UA", "LAB-UCX"]),
      set("DSET-GM-FOLLOW", "経過セット", ["LAB-CBC", "LAB-CRP", ...CHEM]),
      set("DSET-GM-NUTR", "栄養評価セット", ["LAB-TP", "LAB-ALB", "LAB-PREALB", "LAB-ZN", "LAB-VB12", "LAB-FOL", "LAB-VB1", "LAB-FE", "LAB-FERRITIN"]),
    ],
  },
  {
    dept: "循環器内科",
    sets: [
      set("DSET-CARD-HF", "心不全セット", ["LAB-CBC", "LAB-BNP", "LAB-TNT", "LAB-CK", "LAB-CKMB", ...CHEM, "LAB-MG"]),
      set("DSET-CARD-ACS", "胸痛セット", ["LAB-CBC", "LAB-TNT", "LAB-CK", "LAB-CKMB", "LAB-DD", "LAB-PT", "LAB-APTT", ...RENAL_LYTES, "LAB-GLU", "LAB-CRP"]),
      set("DSET-CARD-LIPID", "脂質・糖セット", ["LAB-TCHO", "LAB-LDL", "LAB-HDL", "LAB-TG", "LAB-GLU", "LAB-HBA1C"]),
    ],
  },
  {
    dept: "消化器内科",
    sets: [
      set("DSET-GI-LIVER", "肝機能セット", ["LAB-TP", "LAB-ALB", ...LIVER, "LAB-NH3", "LAB-PT", "LAB-PLT"]),
      set("DSET-GI-PANC", "膵炎セット", ["LAB-CBC", "LAB-CRP", "LAB-AMY", "LAB-LIP", ...LIVER, ...RENAL_LYTES, "LAB-CA", "LAB-GLU", "LAB-LD"]),
      set("DSET-GI-HEP", "肝炎ウイルスセット", ["LAB-HBSAG", "LAB-HBSAB", "LAB-HBCAB", "LAB-HCVAB"]),
    ],
  },
  {
    dept: "呼吸器内科",
    sets: [
      set("DSET-RESP-PNEU", "肺炎セット", ["LAB-CBC", "LAB-DIFF", "LAB-CRP", "LAB-PCT", ...CHEM, "LAB-BGA", "LAB-SPCX", "LAB-SMEAR", "LAB-PNEUUAG", "LAB-LEGUAG"]),
      set("DSET-RESP-ILD", "間質性肺炎セット", ["LAB-KL6", "LAB-LD", "LAB-CRP", "LAB-BDG", "LAB-BGA"]),
      set("DSET-RESP-TB", "結核セット", ["LAB-AFBSMEAR", "LAB-AFBCX", "LAB-TBPCR", "LAB-IGRA"]),
    ],
  },
  {
    dept: "整形外科",
    sets: [
      set("DSET-ORTH-PREOP", "術前セット", ["LAB-CBC", "LAB-PT", "LAB-APTT", ...CHEM, "LAB-CRP", ...HEPATITIS, "LAB-ABO", "LAB-IRRAB", "LAB-UA"]),
      set("DSET-ORTH-POSTOP", "術後セット", ["LAB-CBC", "LAB-CRP", ...CHEM, "LAB-DD"]),
      set("DSET-ORTH-INF", "感染精査セット", ["LAB-CBC", "LAB-DIFF", "LAB-CRP", "LAB-ESR", "LAB-PCT", "LAB-BCX", "LAB-WOUNDCX"]),
    ],
  },
];

export function findLabSet(code: string): LabSet | undefined {
  return BASIC_SETS.find((s) => s.code === code) ?? DEPT_SETS.flatMap((d) => d.sets).find((s) => s.code === code);
}

/** Whether every item of the set is picked (the set shows as "on"). */
export const setPicked = (picked: readonly string[], s: LabSet) => s.codes.every((c) => picked.includes(c));

/**
 * Press a set: when all of its items are picked, take them out; otherwise add the ones missing
 * (an item already picked is not picked twice). The set's own code never enters the picks.
 */
export function toggleSet(picked: readonly string[], s: LabSet): string[] {
  if (setPicked(picked, s)) return picked.filter((c) => !s.codes.includes(c));
  return [...picked, ...s.codes.filter((c) => !picked.includes(c))];
}
