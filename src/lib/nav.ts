// How the screens are organised: who (職種) → where (部署) → which view of it → whose chart (患者).
// Both layouts (A: a home tab with the department's views; B: a menu down the left) use this.

import { TABS, type PinnedTab, type Role } from "./roles";

export interface Dept {
  key: string;
  label: string;
  /** The department's own screens, in order. */
  views: PinnedTab[];
  /** Not in this prototype yet (shown, but cannot be opened). */
  soon?: string;
}

export const DEPTS: Dept[] = [
  { key: "ward", label: "5階東病棟", views: ["sheet", "map", "list", "handoff", "admit", "acuity"] },
  { key: "er", label: "救急外来", views: ["er"] },
  { key: "or", label: "手術室", views: ["or"] },
  { key: "dialysis", label: "透析室", views: ["dialysis"] },
  { key: "pharmacy", label: "薬剤部", views: ["pharmacy"] },
  { key: "lab", label: "検査室", views: ["lab"] },
  { key: "opd", label: "外来", views: [], soon: "この試作には外来はまだありません" },
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

/** The departments a role works in, with only the views it may open; its usual place first. */
export function deptsFor(role: Role): Dept[] {
  const mine = TABS[role];
  const out = DEPTS.map((d) => ({ ...d, views: d.views.filter((v) => mine.includes(v)).sort((a, b) => mine.indexOf(a) - mine.indexOf(b)) })).filter(
    (d) => d.views.length > 0 || (d.soon && (role === "医師" || role === "看護師")),
  );
  const first = mine.find((t) => DEPTS.some((d) => d.views.includes(t)));
  return out.sort((a, b) => Number(b.views.includes(first!)) - Number(a.views.includes(first!)));
}

export const deptOf = (view: PinnedTab): Dept | undefined => DEPTS.find((d) => d.views.includes(view));

/** Tools that are not places: chat and the audit log (shown only if the role has them). */
export const hasTool = (role: Role, t: "chat" | "audit") => TABS[role].includes(t);

export type Layout = "A" | "B";
