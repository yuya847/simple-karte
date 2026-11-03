// セット展開: the fictional hospital's sets that span order kinds (採血・尿・培養・画像・生理). Choosing a
// set puts each item in as a draft; what each one still needs (when, views …) is asked by the usual
// checks, and the doctor can take items out before. The sets are a fictional hospital's agreement.

import type { Draft, LabDraft } from "./drafts";
import { emptyImaging, emptyPhysio, findPhysio } from "./exams";
import { LAB_TESTS } from "./master";

export type SetItem = { kind: "lab"; codes: string[]; cultureSets?: number } | { kind: "imaging"; modality: "X線"; region: string; label: string } | { kind: "physio"; test: string };

export interface CrossSet {
  code: string;
  name: string;
  purpose: string;
  items: SetItem[];
}

export const CROSS_SETS: CrossSet[] = [
  {
    code: "XSET-ADMIT",
    name: "入院時セット（総合診療科）",
    purpose: "入院した日に、いつも一緒に出すもの",
    items: [
      { kind: "lab", codes: ["LAB-CBC", "LAB-DIFF", "LAB-CHEM", "LAB-CRP", "LAB-COAG"] },
      { kind: "lab", codes: ["LAB-UA"] },
      { kind: "imaging", modality: "X線", region: "R-CHEST", label: "胸部X線" },
      { kind: "physio", test: "PHY-ECG" },
    ],
  },
  {
    code: "XSET-FEVER",
    name: "発熱精査セット",
    purpose: "熱の原因を探すときの、最初の検査",
    items: [
      { kind: "lab", codes: ["LAB-CBC", "LAB-DIFF", "LAB-CHEM", "LAB-CRP"] },
      { kind: "lab", codes: ["LAB-BCX"], cultureSets: 2 },
      { kind: "lab", codes: ["LAB-UA", "LAB-UCX"] },
      { kind: "imaging", modality: "X線", region: "R-CHEST", label: "胸部X線" },
    ],
  },
  {
    code: "XSET-HF",
    name: "心不全セット",
    purpose: "心不全を疑ったとき・増悪したとき",
    items: [
      { kind: "lab", codes: ["LAB-CBC", "LAB-CHEM", "LAB-BNP"] },
      { kind: "imaging", modality: "X線", region: "R-CHEST", label: "胸部X線" },
      { kind: "physio", test: "PHY-ECG" },
      { kind: "physio", test: "PHY-UCG" },
    ],
  },
];

export function itemLabel(it: SetItem): string {
  if (it.kind === "lab") return `${it.codes.map((c) => LAB_TESTS.find((t) => t.code === c)?.abbr ?? c).join("・")}${it.cultureSets ? `（${it.cultureSets}セット）` : ""}`;
  if (it.kind === "imaging") return it.label;
  return findPhysio(it.test)?.name ?? it.test;
}

/** The chosen items of a set as drafts (nothing confirmed; the checks ask for what is missing). */
export function expandSet(set: CrossSet, keep: boolean[], newId: () => string): Draft[] {
  const src = `（セット：${set.name}）`;
  return set.items.flatMap((it, i): Draft[] => {
    if (!keep[i]) return [];
    const id = newId();
    if (it.kind === "lab") {
      const d: LabDraft = { id, origin: "manual", sourceText: src, comment: null, kind: "lab", tests: it.codes.map((code) => ({ code, said: code })), collect: { day: null, when: null, time: null, beforeDose: null }, priority: null, cultureSets: it.cultureSets ?? null, duplicateOk: false };
      return [d];
    }
    if (it.kind === "imaging") return [{ ...emptyImaging(id, it.modality), sourceText: src, region: it.region }];
    return [{ ...emptyPhysio(id, it.test), sourceText: src }];
  });
}
