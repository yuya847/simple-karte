// How the screens are organised:
// - the top row: the place pulldown (病棟・救急外来・外来・手術室・透析室… and the shared places), then the
//   screens of the place. 病棟: the screens chosen from its menu (入院患者一覧・病棟マップ・受け持ち患者・
//   ◯階, and the ward's work; 科別・主治医別 are the conditions and grouping of 入院患者一覧). 救急外来・外来: the list. The other places open as they are.
// - the second row: every open chart in one row, wherever it was opened from; each chart remembers the
//   screen it was opened from (its owner), shown as a breadcrumb over the chart.

import { TABS, type PinnedTab, type Role } from "./roles";

export type AreaKey = "ward" | "er" | "opd" | "or" | "dialysis" | "pharmacy" | "lab" | "blood" | "path" | "physio" | "phs" | "board" | "manual" | "incident" | "chat" | "audit" | "extract" | "liaison" | "receipt" | "stats" | "druginfo";

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
  { key: "blood", label: "輸血部門", short: "輸血", kind: "page" },
  { key: "path", label: "病理", short: "病理", kind: "page" },
  { key: "physio", label: "生理検査室", short: "生理", kind: "page" },
  { key: "liaison", label: "地域医療連携", short: "連携", kind: "page" },
  { key: "receipt", label: "レセプト点検・返戻", short: "レセプト", kind: "page" },
  { key: "stats", label: "統計・日報", short: "統計", kind: "page" },
  { key: "phs", label: "院内連絡", short: "連絡", kind: "page" },
  { key: "board", label: "掲示板", short: "掲示板", kind: "page" },
  { key: "druginfo", label: "医薬品集・DI", short: "医薬品集", kind: "page" },
  { key: "manual", label: "院内マニュアル", short: "マニュアル", kind: "page" },
  { key: "incident", label: "インシデントレポート", short: "インシデント", kind: "page" },
  { key: "chat", label: "チャット", short: "チャット", kind: "page", tool: true },
  { key: "audit", label: "監査ログ", short: "監査", kind: "page", tool: true },
  { key: "extract", label: "データ抽出", short: "抽出", kind: "page", tool: true },
];

/** The view a role must have to use a place (from the role's tabs in roles.ts). */
const NEEDS: Partial<Record<AreaKey, PinnedTab>> = { er: "er", or: "or", dialysis: "dialysis", pharmacy: "pharmacy", lab: "lab", blood: "lab", path: "lab", physio: "lab", chat: "chat", audit: "audit" };
/** Places every role has: in-hospital calls (院内連絡), the hospital's notices, the formulary (医薬品集・DI), manuals and incident reports. */
const EVERYONE: AreaKey[] = ["phs", "board", "druginfo", "manual", "incident"];

// ---------------------------------------------------------------------------
// ② inside 病棟
// ---------------------------------------------------------------------------

export type WardTab = "map" | "floor" | "mine" | "all" | "sheet" | "handoff" | "admit" | "support" | "beds" | "meals" | "acuity" | "journal" | "iji" | "roster" | "cosign" | "io" | "narcotic" | "recent";

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
  { key: "all", label: "入院患者一覧", hint: "全病棟の入院患者。病棟・診療科・主治医・担当看護師・入院日数・DPC の期間・印で絞り、病棟・診療科・主治医・担当看護師ごとにまとめられます", group: "patients", needs: "list" },
  { key: "map", label: "病棟マップ", hint: "部屋とベッドの見取り図と入院申込。階を選べます", group: "patients", needs: "map" },
  { key: "mine", label: "受け持ち患者", hint: "自分のチームの患者", group: "patients", needs: "list" },
  { key: "recent", label: "最近開いた患者", hint: "自分が最近カルテを開いた患者を新しい順に（この端末のみに保存）", group: "patients", needs: "list" },
  { key: "floor", label: "◯階の患者一覧", hint: "選んだ病棟（全病棟も選べる）の患者と、今日・明日の入退院と空床", group: "patients", needs: "list" },
  { key: "sheet", label: "ワークシート", hint: "今日の与薬・処置と指示受け", group: "work", needs: "sheet" },
  { key: "io", label: "水分出納", hint: "受け持ち患者の IN/OUT を勤務の終わりにまとめて入れ、勤務ごと・24時間の合計と IN − OUT を見る", group: "work", needs: "sheet" },
  { key: "narcotic", label: "麻薬の施用票", hint: "麻薬の注射を実施したら施用票（施用量・残量 mL）を書き、残液・空アンプルを薬剤部へ返納する。残った内服の麻薬の返納も", group: "work", needs: "sheet" },
  { key: "handoff", label: "申し送り", hint: "I-PASS の形で次の勤務へ", group: "work", needs: "handoff" },
  { key: "admit", label: "入院時の評価", hint: "期限のある評価（褥瘡・栄養・退院支援など）", group: "work", needs: "admit" },
  { key: "beds", label: "ベッドコントロール", hint: "全病棟の空床（性別・個室）、今日と明日の入退院、明日の朝の空床の見込み、入院申込に合うベッド", group: "work", needs: "map" },
  { key: "support", label: "退院支援の一覧", hint: "患者ごとに、退院困難な要因・話合い・計画・カンファレンス・計画書・転院の打診・退院の予定", group: "work", needs: "admit" },
  { key: "meals", label: "病棟の食事", hint: "今日と明日の朝・昼・夕：食種・形態・食止め、食数（コードで数える）と締切", group: "work", needs: "meals" },
  { key: "acuity", label: "看護必要度", hint: "B 項目の評価（5階東）", group: "work", needs: "acuity" },
  { key: "journal", label: "看護日誌", hint: "選んだ階の今日の数（コードで数える）と所感", group: "work", needs: "sheet" },
  { key: "iji", label: "医事課の仕事", hint: "患者ごとに、保険の未登録・退院して会計がまだ・算定の要確認・未コード化の病名", group: "work", needs: "iji" },
  { key: "cosign", label: "研修医の記録の確認", hint: "研修医の記事とオーダで、指導医か上級医の確認がまだのもの（確かめた人と時刻も）", group: "work", needs: "audit" },
  { key: "roster", label: "勤務表と様式9", hint: "看護師長が月の勤務を入れ、夜勤時間・月平均72時間・10対1・夜勤の組み合わせをコードで確かめる（5階東）", group: "work", needs: "sheet" },
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
    if (a.key === "opd") return role === "医師" || role === "看護師" || role === "医事課";
    if (a.key === "liaison") return role === "医師" || role === "看護師" || role === "MSW" || role === "医事課";
    if (a.key === "receipt") return role === "医事課" || role === "医師";
    if (a.key === "stats") return role === "医師" || role === "看護師" || role === "医事課";
    if (EVERYONE.includes(a.key)) return true;
    if (a.key === "extract") return role === "医師" || role === "医事課" || role === "看護師";
    // 病理: the technologists' work, and the report the pathologist (a doctor) writes.
    if (a.key === "path" && role === "医師") return true;
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
