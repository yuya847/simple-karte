import type { PanelKind } from "@/components/ToolRail";
import { denyReason, type Action, type Role } from "./roles";
/** Tile permissions share the action checks used by the corresponding forms. */
const ACTIONS: Partial<Record<PanelKind, Action>> = {
  nutrition: "assess.nutrition", diet: "diet", diagnoses: "diagnosis", take: "mar", vitals: "vitals",
  "care-orders": "nursing.plan", "nursing-plan": "nursing.plan", anamnesis: "anamnesis",
  directive: "directive", "opd-booking": "order", "tx-bedside": "tx.bedside", pressure: "pressure", bedside: "bedside", io: "io",
  // 転院・施設の調整 is the MSW's (and nurses') work: hidden for the other roles.
  transfer: "assess.discharge",
};
export function nutritionTileBlocks(role: Role): Partial<Record<PanelKind, string>> {
  if (role === "医師") return {};
  return Object.fromEntries(Object.entries(ACTIONS).flatMap(([key, action]) => {
    const reason = denyReason(role, action);
    return reason ? [[key, reason]] : [];
  }));
}
