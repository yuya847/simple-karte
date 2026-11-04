import type { PanelKind } from "@/components/ToolRail";
import { denyReason, type Action, type Role } from "./roles";
/** Tile permissions share the action checks used by the corresponding forms. */
const ACTIONS: Partial<Record<PanelKind, Action>> = {
  nutrition: "assess.nutrition", diet: "diet", diagnoses: "diagnosis", take: "mar", vitals: "vitals",
  "care-orders": "nursing.plan", "nursing-plan": "nursing.plan", anamnesis: "anamnesis",
  directive: "directive", "opd-booking": "order", "tx-bedside": "tx.bedside", pressure: "pressure", bedside: "bedside", io: "io",
};
export function nutritionTileBlocks(role: Role): Partial<Record<PanelKind, string>> {
  if (role === "医師") return {};
  return Object.fromEntries(Object.entries(ACTIONS).flatMap(([key, action]) => {
    const reason = denyReason(role, action);
    return reason ? [[key, reason]] : [];
  }));
}
