import type { ConsentCode } from "./consent";

export const CATH_STUDIES = ["冠動脈造影 CAG", "左室造影", "右心カテ", "FFR", "IVUS", "OCT"] as const;
export interface CardiacCath {
  studies: string[];
  pci: boolean;
  approach: "橈骨" | "上腕" | "大腿" | "";
  side: "右" | "左" | "";
  renalChecked: boolean;
  allergyChecked: boolean;
  metformin: string;
  preparation: string;
}
export const emptyCath = (): CardiacCath => ({ studies: [], pci: false, approach: "", side: "", renalChecked: false, allergyChecked: false, metformin: "", preparation: "" });
export function cathProblems(c?: CardiacCath): string[] {
  if (!c) return ["心カテの内容"];
  return [!c.studies.length && "検査の種類", !c.approach && "アプローチ", !c.side && "左右", !c.renalChecked && "腎機能の確認", !c.allergyChecked && "造影剤アレルギーの確認", !c.metformin.trim() && "メトホルミンの確認"].filter((x): x is string => !!x);
}
export function cathConsents(c?: CardiacCath): ConsentCode[] { return c?.pci ? ["CONSENT-CATH", "CONSENT-PCI"] : ["CONSENT-CATH"]; }
/** 診療行為マスター s_20261102.csv のコード。付加検査は算定担当が実施内容を確認する。 */
export function cathCodes(c?: CardiacCath): string[] {
  if (!c) return [];
  return [...(c.studies.some(s => s !== "右心カテ") ? ["160064510"] : []), ...(c.studies.includes("右心カテ") ? ["160064610"] : [])];
}
export function cathText(c: CardiacCath): string {
  return `${c.studies.join("・")}／PCI ${c.pci ? "予定あり" : "予定なし"}／${c.side}${c.approach}／メトホルミン：${c.metformin}／前処置：${c.preparation || "指示なし"}`;
}
