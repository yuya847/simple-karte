// レセプトの点検: the claim's own checks (the same calculation as the 算定 screen and the UKE file), gathered
// per patient and sorted into what a person looks at — 病名と算定の不一致, 算定漏れの候補, 人が選ぶ, 確かめる,
// and what the calculation left out. Nothing new is decided here: each line is a check that already exists,
// and where it came from is shown.

import { UNCODED, type Diagnosis } from "../diagnoses";
import { ASSUMED_INSURANCE_ISSUE } from "./insurance";
import type { ClaimIssue } from "./model";

export type InspectKind = "病名と算定の不一致" | "算定漏れの候補" | "人が選ぶ" | "確かめる" | "算定から外したもの";
export const INSPECT_KINDS: InspectKind[] = ["病名と算定の不一致", "算定漏れの候補", "人が選ぶ", "確かめる", "算定から外したもの"];

export interface InspectItem {
  kind: InspectKind;
  text: string;
  /** Which check said it. */
  from: "算定の計算" | "レセプト（記録条件仕様）の点検" | "病名の登録";
}

/** Words of the claim's checks that are about 病名. */
const DISEASE = /病名|傷病名|ICD-10|医療資源/;
/** Words of the claim's checks that say something may be missing from the claim (to be added by a person). */
const MISSING = /足してください|入っていません|まだ組んでいません|算定し直してください|退院した日に算定します|自動では入りません/;

/** Sort one of the claim's checks. 参考 (info) lines are kept only when they say something may be missing. */
export function classify(i: ClaimIssue): InspectKind | null {
  if (i.text === ASSUMED_INSURANCE_ISSUE) return "確かめる";
  if (DISEASE.test(i.text) && i.level !== "excluded") return "病名と算定の不一致";
  if (MISSING.test(i.text)) return "算定漏れの候補";
  if (i.level === "choose") return "人が選ぶ";
  if (i.level === "review") return "確かめる";
  if (i.level === "excluded") return "算定から外したもの";
  return null;
}

/** One patient's 点検: the claim's checks, the receipt's checks, and 未コード化の病名. */
export function inspectItems(issues: ClaimIssue[], receiptProblems: string[], diagnoses: Diagnosis[]): InspectItem[] {
  const out: InspectItem[] = [];
  const seen = new Set<string>();
  const push = (x: InspectItem) => {
    if (seen.has(x.kind + x.text)) return;
    seen.add(x.kind + x.text);
    out.push(x);
  };
  for (const i of issues) {
    const kind = classify(i);
    if (kind) push({ kind, text: i.text, from: "算定の計算" });
  }
  for (const p of receiptProblems) push({ kind: DISEASE.test(p) || /主傷病/.test(p) ? "病名と算定の不一致" : "確かめる", text: p.replace(/^[^：]*：/, ""), from: "レセプト（記録条件仕様）の点検" });
  const uncoded = diagnoses.filter((d) => d.code === UNCODED);
  if (uncoded.length && !receiptProblems.some((p) => p.includes("未コード化"))) push({ kind: "病名と算定の不一致", text: `未コード化傷病名 ${uncoded.map((d) => d.name).join("、")}（傷病名マスターの名前に直すのは医師）`, from: "病名の登録" });
  return out.sort((a, b) => INSPECT_KINDS.indexOf(a.kind) - INSPECT_KINDS.indexOf(b.kind));
}

export function inspectCounts(rows: { items: InspectItem[] }[]): Record<InspectKind, number> {
  return Object.fromEntries(INSPECT_KINDS.map((k) => [k, rows.reduce((n, r) => n + r.items.filter((i) => i.kind === k).length, 0)])) as Record<InspectKind, number>;
}
