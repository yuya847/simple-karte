// How the screens are organised, in three levels (①>②>③):
// ① the left menu: the places (病棟・救急外来・外来・手術室・透析室…).
// ② the tabs on top. 病棟: the screens chosen from its menu (病棟マップ・◯階の患者一覧・受け持ち患者・科別・
//    患者一覧・主治医別, and the ward's work: ワークシート・申し送り・入院時の評価・看護必要度).
//    救急外来・外来: the list, then a tab for each patient. The other places open as they are.
// ③ inside 病棟, under each ② tab: the charts opened from it.

import { TABS, type PinnedTab, type Role } from "./roles";

export type AreaKey = "ward" | "er" | "opd" | "or" | "dialysis" | "pharmacy" | "lab" | "board" | "manual" | "incident" | "chat" | "audit";

export interface Area {
  key: AreaKey;
  label: string;
  /** Short name under the icon when the left menu is narrow. */
  short: string;
  /** ward: ② chosen from a menu, ③ the charts; patients: ② the list then the patients; page: as it is. */
  kind: "ward" | "patients" | "page";
  /** Not in this prototype yet: shown in the menu, cannot be opened. */
  soon?: string;
  /** A tool rather than a place (at the bottom of the menu, or in the user menu). */
  tool?: boolean;
}

export const AREAS: Area[] = [
  { key: "ward", label: "病棟", short: "病棟", kind: "ward" },
  { key: "er", label: "救急外来", short: "救急", kind: "patients" },
  { key: "opd", label: "外来", short: "外来", kind: "patients" },
  { key: "or", label: "手術室", short: "手術室", kind: "page" },
  { key: "dialysis", label: "透析室", short: "透析", kind: "page" },
  { key: "pharmacy", label: "薬剤部", short: "薬剤部", kind: "page" },
  { key: "lab", label: "検査室", short: "検査室", kind: "page" },
  { key: "board", label: "掲示板", short: "掲示板", kind: "page", soon: "準備中" },
  { key: "manual", label: "院内マニュアル", short: "マニュアル", kind: "page", soon: "準備中" },
  { key: "incident", label: "インシデントレポート", short: "インシデント", kind: "page", soon: "準備中" },
  { key: "chat", label: "チャット", short: "チャット", kind: "page", tool: true },
  { key: "audit", label: "監査ログ", short: "監査", kind: "page", tool: true },
];

/** The view a role must have to use a place (from the role's tabs in roles.ts). */
const NEEDS: Partial<Record<AreaKey, PinnedTab>> = { er: "er", or: "or", dialysis: "dialysis", pharmacy: "pharmacy", lab: "lab", chat: "chat", audit: "audit" };
/** Places every role has: the hospital's notices, manuals and incident reports. */
const EVERYONE: AreaKey[] = ["board", "manual", "incident"];

// ---------------------------------------------------------------------------
// ② inside 病棟
// ---------------------------------------------------------------------------

export type WardTab = "map" | "floor" | "mine" | "dept" | "all" | "doctor" | "sheet" | "handoff" | "admit" | "acuity";

export interface WardTabInfo {
  key: WardTab;
  label: string;
  hint: string;
  /** 患者を見る (who is where) or 病棟の仕事 (the ward's work for its patients). */
  group: "patients" | "work";
  /** The role's view that allows it. */
  needs: PinnedTab;
}

export const WARD_TABS: WardTabInfo[] = [
  { key: "map", label: "病棟マップ", hint: "部屋とベッドの見取り図。階を選べます", group: "patients", needs: "map" },
  { key: "floor", label: "◯階の患者一覧", hint: "選んだ階の患者を表で（階はプルダウンで選ぶ）", group: "patients", needs: "list" },
  { key: "mine", label: "受け持ち患者", hint: "自分のチームの患者", group: "patients", needs: "list" },
  { key: "dept", label: "科別", hint: "診療科ごとにまとめた一覧。科で絞れます", group: "patients", needs: "list" },
  { key: "all", label: "患者一覧", hint: "全病棟の入院患者を病棟ごとに", group: "patients", needs: "list" },
  { key: "doctor", label: "主治医別", hint: "主治医ごとにまとめた一覧。主治医で絞れます", group: "patients", needs: "list" },
  { key: "sheet", label: "ワークシート", hint: "今日の与薬・処置と指示受け", group: "work", needs: "sheet" },
  { key: "handoff", label: "申し送り", hint: "I-PASS の形で次の勤務へ", group: "work", needs: "handoff" },
  { key: "admit", label: "入院時の評価", hint: "期限のある評価（褥瘡・栄養・退院支援など）", group: "work", needs: "admit" },
  { key: "acuity", label: "看護必要度", hint: "B 項目の評価（5階東）", group: "work", needs: "acuity" },
];

export const wardTabInfo = (t: WardTab): WardTabInfo => WARD_TABS.find((x) => x.key === t)!;

/** The ② tab's name: ◯階 shows the floor chosen. */
export const wardTabLabel = (t: WardTab, floor: string): string => (t === "floor" ? floor : wardTabInfo(t).label);

/** The ② screens a role may open inside 病棟. */
export const wardTabsFor = (role: Role): WardTab[] => WARD_TABS.filter((t) => TABS[role].includes(t.needs)).map((t) => t.key);

/** The places (and tools) a role uses, in the menu's order. */
export function areasFor(role: Role): Area[] {
  const mine = TABS[role];
  return AREAS.filter((a) => {
    if (a.key === "ward") return wardTabsFor(role).length > 0;
    if (a.key === "opd") return role === "医師" || role === "看護師";
    if (EVERYONE.includes(a.key)) return true;
    const need = NEEDS[a.key];
    return !!need && mine.includes(need);
  });
}

/** Where a role starts: the place of its first view (薬剤師 → 薬剤部, 看護師 → 病棟 …). */
export function homeArea(role: Role): AreaKey {
  const first = TABS[role][0];
  return (Object.entries(NEEDS).find(([, v]) => v === first)?.[0] as AreaKey | undefined) ?? "ward";
}

/** Keep only the screens the role may open (for defaults saved earlier, or after a role change). */
export const allowedWardTabs = (role: Role, tabs: WardTab[]): WardTab[] => {
  const ok = wardTabsFor(role);
  return [...new Set(tabs)].filter((t) => ok.includes(t));
};

// ---------------------------------------------------------------------------
// ③ the charts, each under the ② tab it was opened from
// ---------------------------------------------------------------------------

export type Owner = `ward:${WardTab}` | "er" | "opd";
export const wardOwner = (t: WardTab): Owner => `ward:${t}`;
export const wardTabOf = (o: Owner): WardTab | null => (o.startsWith("ward:") ? (o.slice(5) as WardTab) : null);

export interface PatientTab {
  id: string;
  owner: Owner;
}

/** Where a chart opens: where it is already open, else under the tab it is opened from, else the fallback. */
export function ownerFor(tabs: PatientTab[], id: string, from: Owner | null, fallback: Owner): Owner {
  return tabs.find((t) => t.id === id)?.owner ?? from ?? fallback;
}

/** The chart to show after one is closed: the next one under the same tab, or null (the tab's own screen). */
export function nextAfterClose(tabs: PatientTab[], id: string): string | null {
  const t = tabs.find((x) => x.id === id);
  if (!t) return null;
  const same = tabs.filter((x) => x.owner === t.owner);
  const i = same.findIndex((x) => x.id === id);
  const rest = same.filter((x) => x.id !== id);
  return rest[Math.min(i, rest.length - 1)]?.id ?? null;
}

/** After a role change: charts under a tab the role cannot open move to the role's first patient list. */
export function rehome(tabs: PatientTab[], allowed: WardTab[]): PatientTab[] {
  const fallback = (["mine", "all", "floor", "map"] as WardTab[]).find((t) => allowed.includes(t)) ?? allowed[0];
  return tabs.map((t) => {
    const w = wardTabOf(t.owner);
    return w && !allowed.includes(w) && fallback ? { ...t, owner: wardOwner(fallback) } : t;
  });
}
