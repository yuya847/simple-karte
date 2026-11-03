// How the screens are organised: who (職種) → where (場所: 病棟・外来・救急外来…, the left menu) →
// which patients (inside 病棟: a ward, a department, or 受け持ち, as tabs) → which view (マップ・一覧…)
// → whose chart (a patient tab). Places and patients share the tab bar on top.

import { TABS, type PinnedTab, type Role } from "./roles";
import type { BedAssignment } from "./ward";
import type { Patient } from "./types";

export type AreaKey = "ward" | "opd" | "er" | "or" | "dialysis" | "pharmacy" | "lab" | "chat" | "audit";

export interface Area {
  key: AreaKey;
  label: string;
  /** Short name under the icon when the left menu is narrow. */
  short: string;
  views: PinnedTab[];
  /** Not in this prototype yet: shown in the menu, cannot be opened. */
  soon?: string;
  /** A tool rather than a place (shown at the bottom of the menu, or in the user menu). */
  tool?: boolean;
}

export const AREAS: Area[] = [
  { key: "ward", label: "病棟", short: "病棟", views: ["sheet", "map", "list", "handoff", "admit", "acuity"] },
  { key: "opd", label: "外来", short: "外来", views: [], soon: "この試作には外来はまだありません" },
  { key: "er", label: "救急外来", short: "救急", views: ["er"] },
  { key: "or", label: "手術室", short: "手術室", views: ["or"] },
  { key: "dialysis", label: "透析室", short: "透析", views: ["dialysis"] },
  { key: "pharmacy", label: "薬剤部", short: "薬剤部", views: ["pharmacy"] },
  { key: "lab", label: "検査室", short: "検査室", views: ["lab"] },
  { key: "chat", label: "チャット", short: "チャット", views: ["chat"], tool: true },
  { key: "audit", label: "監査ログ", short: "監査", views: ["audit"], tool: true },
];

export const VIEW_LABEL: Record<PinnedTab, string> = {
  map: "病棟マップ",
  list: "患者一覧",
  sheet: "ワークシート",
  handoff: "申し送り",
  admit: "入院時の評価",
  acuity: "看護必要度",
  er: "救急外来",
  or: "手術室",
  dialysis: "透析室",
  pharmacy: "薬剤部",
  lab: "検査室",
  chat: "チャット",
  audit: "監査ログ",
};

/** The places (and tools) a role uses, each with only the views it may open, its usual place first. */
export function areasFor(role: Role): Area[] {
  const mine = TABS[role];
  const out = AREAS.map((a) => ({ ...a, views: a.views.filter((v) => mine.includes(v)).sort((x, y) => mine.indexOf(x) - mine.indexOf(y)) })).filter(
    (a) => a.views.length > 0 || (a.soon && (role === "医師" || role === "看護師")),
  );
  const first = mine[0];
  return out.sort((a, b) => Number(b.views.includes(first)) - Number(a.views.includes(first)));
}

export const areaOf = (view: PinnedTab): AreaKey => AREAS.find((a) => a.views.includes(view))?.key ?? "ward";

// ---------------------------------------------------------------------------
// Inside 病棟: which patients (tabs that can be opened and closed)
// ---------------------------------------------------------------------------

export interface Scope {
  key: string;
  kind: "ward" | "dept" | "mine";
  label: string;
  value: string;
  soon?: string;
}

/** The wards of the fictional hospital (only 5階東 has patients in this prototype). */
export const WARDS: { name: string; soon?: string }[] = [{ name: "5階東病棟" }, { name: "5階南病棟", soon: "この試作の病棟は5階東だけです" }];

export function scopeOptions(departments: string[]): Scope[] {
  return [
    ...WARDS.map((w): Scope => ({ key: `ward:${w.name}`, kind: "ward", label: w.name, value: w.name, soon: w.soon })),
    { key: "mine", kind: "mine", label: "受け持ち患者", value: "" },
    ...departments.map((d): Scope => ({ key: `dept:${d}`, kind: "dept", label: d, value: d })),
  ];
}

/** The tabs open inside 病棟 at first, by role. */
export function defaultScopes(role: Role): string[] {
  if (role === "医師") return ["mine", "ward:5階東病棟"];
  if (role === "看護師") return ["ward:5階東病棟", "mine"];
  return ["ward:5階東病棟"];
}

/** Whether a bed (and its patient) belongs to the tab: the ward, 受け持ち (our team's charts), or a department. */
export function bedInScope(s: Scope, b: BedAssignment, patient?: Patient): boolean {
  if (s.kind === "ward") return true;
  if (s.kind === "mine") return !!b.patientId;
  return (patient?.department ?? b.other?.department) === s.value;
}

/** Views that make sense for the tab: 看護必要度 is counted for a whole ward only. */
export const viewsForScope = (s: Scope, views: PinnedTab[]) => (s.kind === "ward" ? views : views.filter((v) => v !== "acuity"));
