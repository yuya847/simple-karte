import type { PanelKind } from "@/components/ToolRail";
import type { Role } from "./roles";
import { specialistRoles } from "./specialist";
// 参照と記事以外のツールは専門職の業務画面から操作しない。
export const SPECIALIST_READ_TOOLS: PanelKind[] = ["templates", "schema", "results", "results-timeline", "imaging", "active-orders", "docs", "labels", "reports", "report-list", "profile", "patient-info", "monitor", "chat"];
export function specialistTileBlocks(role: Role): Partial<Record<PanelKind, string>> {
  if (!specialistRoles.includes(role)) return {};
  const write: PanelKind[] = ["scans", "diet", "standing", "path", "discharge-stop", "care-orders", "nursing-plan", "nutrition", "io", "anamnesis", "guide-record", "pressure", "tx-bedside", "bedside", "take", "vitals", "transfer", "diagnoses", "consents", "directive", "discharge", "national", "team", "visit-request", "visit-rx", "opd-booking", "rehab-progress", "access-limit", "billing", "opd-bill", "flow-entry", "cosign"];
  return Object.fromEntries(write.filter(k => !SPECIALIST_READ_TOOLS.includes(k) && !(k === "team" && (role === "ICT" || role === "歯科衛生士"))).map(k => [k, `${role}は参照のみです。記録は病棟の専用画面または記事から行います。`]));
}
