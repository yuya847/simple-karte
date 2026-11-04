import type { DrugMaster } from "./master";
/** 商品名を主表示、一般名と分類を補足へ分ける。 */
export function injectionDrugLabel(drug: Pick<DrugMaster, "name" | "generic" | "category" | "package">) {
  return { name: drug.name, supplement: [...new Set([drug.generic, drug.category, drug.package].filter(Boolean))].join(" ・ ") };
}
