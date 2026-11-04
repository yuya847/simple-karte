// How the screens are organised:
// - the top row: the place pulldown (病棟・救急外来・外来・手術室・透析室… and the shared places), then the
//   screens of the place. 病棟: the screens chosen from its menu (入院患者一覧・病棟マップ・受け持ち患者,
//   and the ward's work; 科別・主治医別・◯階 are the conditions, grouping and ward pulldown of 入院患者一覧).
//   救急外来・外来: the list. The other places open as they are.
// - the second row: every open chart in one row, wherever it was opened from, grouped by place (病棟・
//   救急外来・外来; tab-groups.ts); each chart remembers the screen it was opened from (its owner), shown
//   as a breadcrumb over the chart.

import { TABS, type PinnedTab, type Role } from "./roles";

export type AreaKey = "ward" | "er" | "opd" | "or" | "dialysis" | "pharmacy" | "lab" | "blood" | "path" | "physio" | "phs" | "board" | "manual" | "incident" | "chat" | "audit" | "extract" | "liaison" | "receipt" | "stats" | "druginfo" | "endo" | "kitchen" | "teams" | "bcp" | "system" | "radiology" | "rehab";

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
  { key: "endo", label: "内視鏡室", short: "内視鏡", kind: "page" },
  { key: "kitchen", label: "栄養部門（給食）", short: "給食", kind: "page" },
  { key: "teams", label: "チーム医療", short: "チーム", kind: "page" },
  { key: "radiology", label: "放射線部", short: "放射線", kind: "page" },
  { key: "rehab", label: "リハビリテーション部", short: "リハビリ", kind: "page" },
  { key: "liaison", label: "地域医療連携", short: "連携", kind: "page" },
  { key: "receipt", label: "レセプト点検・返戻", short: "レセプト", kind: "page" },
  { key: "stats", label: "統計・日報", short: "統計", kind: "page" },
  { key: "phs", label: "院内連絡", short: "連絡", kind: "page" },
  { key: "board", label: "掲示板", short: "掲示板", kind: "page" },
  { key: "druginfo", label: "医薬品集・DI", short: "医薬品集", kind: "page" },
  { key: "manual", label: "院内マニュアル", short: "マニュアル", kind: "page" },
  { key: "incident", label: "インシデントレポート", short: "インシデント", kind: "page" },
  { key: "bcp", label: "障害時の参照", short: "障害時", kind: "page" },
  { key: "system", label: "システム管理", short: "システム", kind: "page" },
  { key: "chat", label: "チャット", short: "チャット", kind: "page", tool: true },
  { key: "audit", label: "監査ログ", short: "監査", kind: "page", tool: true },
  { key: "extract", label: "データ抽出", short: "抽出", kind: "page", tool: true },
];

/** The view a role must have to use a place (from the role's tabs in roles.ts). */
const EVERYONE: AreaKey[] = ["phs", "board", "druginfo", "manual", "incident"];
const NEEDS: Partial<Record<AreaKey, PinnedTab>> = { er: "er", or: "or", dialysis: "dialysis", pharmacy: "pharmacy", lab: "lab", blood: "lab", path: "lab", physio: "lab", radiology: "ris", rehab: "rehab", chat: "chat", audit: "audit" };

// ---------------------------------------------------------------------------
// ② inside 病棟
// ---------------------------------------------------------------------------

export type WardTab = "consults" | "map" | "mine" | "all" | "sheet" | "take" | "execute" | "handoff" | "admit" | "support" | "beds" | "meals" | "acuity" | "journal" | "iji" | "roster" | "cosign" | "io" | "narcotic" | "recent" | "favorites" | "reports" | "undone" | "summaries" | "nsummaries" | "paths" | "ulcers" | "status" | "assign" | "falls" | "vitals" | "monitor";

export interface WardTabInfo {
  key: WardTab;
  label: string;
  hint: string;
  /** 患者を見る (who is where) or 病棟の仕事 (the ward's work for its patients). */
  group: "patients" | "work";
  /** The role's view that allows it (any of them, when several). */
  needs: PinnedTab | PinnedTab[];
}

export const WARD_TABS: WardTabInfo[] = [
  { key: "all", label: "入院患者一覧", hint: "入院患者の一覧。「病棟」のプルダウンで全病棟か1つの病棟（その病棟の今日・明日の入退院と空床も出る）を選び、病棟・診療科・主治医・担当看護師・入院日数・DPC の期間・印で絞り、病棟・診療科・主治医・担当看護師ごとにまとめられます", group: "patients", needs: "list" },
  { key: "map", label: "病棟マップ", hint: "部屋とベッドの見取り図と入院申込。階を選べます", group: "patients", needs: "map" },
  { key: "mine", label: "受け持ち患者", hint: "自分のチームの患者", group: "patients", needs: "list" },
  { key: "recent", label: "最近開いた患者", hint: "自分が最近カルテを開いた患者を新しい順に（この端末のみに保存）", group: "patients", needs: "list" },
  { key: "favorites", label: "お気に入りの患者", hint: "氏名の横の☆で登録した患者を全病棟から（この端末のみに保存）", group: "patients", needs: "list" },
  { key: "consults", label: "コンサルト依頼", hint: "自分と自分の科への依頼を古い順に見る", group: "work", needs: "handoff" },
  { key: "take", label: "指示受け", hint: "病棟の患者の、まだ受けていない指示（新規・変更・中止・指示簿・食事）を患者ごとに、時刻の順か急ぐ順で。受けたら、その指示が今日と明日に作る予定を見て確認する（指示受け → 指示確認 → 実施入力）。今日受けたものと指示票の印刷も", group: "work", needs: "sheet" },
  { key: "execute", label: "実施入力", hint: "その日の予定（注射・内服・処置・採血・検査）を患者ごとに指示票の形で並べ、「実施した」で時刻と実施者を入れて記録する（ワークシートと同じ記録。照合はしない）", group: "work", needs: "sheet" },
  { key: "sheet", label: "ワークシート", hint: "今日の与薬・処置と指示受け", group: "work", needs: "sheet" },
  { key: "io", label: "水分出納", hint: "受け持ち患者の IN/OUT を勤務の終わりにまとめて入れ、勤務ごと・24時間の合計と IN − OUT を見る", group: "work", needs: "sheet" },
  { key: "narcotic", label: "麻薬の施用票", hint: "麻薬の注射を実施したら施用票（施用量・残量 mL）を書き、残液・空アンプルを薬剤部へ返納する。残った内服の麻薬の返納も", group: "work", needs: "sheet" },
  { key: "undone", label: "未実施の一覧", hint: "時刻を過ぎても実施・未実施の記録がないオーダ（実施漏れ）と、処置の実施の記録と算定が合わないもの（算定漏れの候補）", group: "work", needs: ["sheet", "iji"] },
  { key: "vitals", label: "バイタルの一括入力", hint: "業務分担の受け持ち・チーム・階の全員のバイタルを1つの表で入れ、指示簿の連絡基準と NEWS2 で知らせる（カルテのバイタルと同じ記録）", group: "work", needs: "sheet" },
  { key: "monitor", label: "セントラルモニター", hint: "受け持ちのうちモニターを付けている患者（酸素投与中・心拍数 100 以上・SpO2 95 未満・入院 2 日以内＋看護師が手で付けた患者。架空の取り決め）を分割画面で。模擬：装置にはつないでいません。枠を押すとカルテと患者モニターが開きます", group: "work", needs: ["sheet", "handoff"] },
  { key: "assign", label: "業務分担", hint: "勤務表のその勤務帯の看護師に部屋・ベッドの受け持ちを割り当てる（ワークシートと病棟マップに出る。確定のあとの変更は理由つきで記録）", group: "work", needs: "sheet" },
  { key: "status", label: "状態の一括登録", hint: "勤務帯ごとに、階の全員の重症度・看護度・救護区分・感染経路別予防策を1つの表で入れて登録する（区分の多くは架空の病院の取り決め）", group: "work", needs: "sheet" },
  { key: "reports", label: "レポート", hint: "受け持ちの患者の読影・病理・内視鏡・生理検査のレポートを患者ごとに、未読の多い順に。本文を読み、医師は「確認した」で既読にする", group: "work", needs: "handoff" },
  { key: "handoff", label: "申し送り", hint: "I-PASS の形で次の勤務へ", group: "work", needs: "handoff" },
  { key: "admit", label: "入院時の評価", hint: "期限のある評価（褥瘡・栄養・退院支援など）", group: "work", needs: "admit" },
  { key: "paths", label: "クリティカルパス", hint: "パスを使っている患者の今日の日目・評価がまだのアウトカム、バリアンスの一覧と分類ごとの件数", group: "work", needs: "handoff" },
  { key: "falls", label: "転倒・転落の再評価", hint: "受け持ちのチームの患者の、転倒・転落の危険因子を確かめ直す日（前の評価から7日、転棟・転床や手術のあと）と、再評価の記録", group: "work", needs: "sheet" },
  { key: "ulcers", label: "褥瘡のある患者", hint: "階の褥瘡のある患者：部位・発生・最新の DESIGN-R®2020 と前回からの変化・写真・次の評価の期限（記録からコードで並べる）", group: "work", needs: "admit" },
  { key: "beds", label: "ベッドコントロール", hint: "全病棟の空床（性別・個室）、今日と明日の入退院、明日の朝の空床の見込み、入院申込に合うベッド", group: "work", needs: "map" },
  { key: "support", label: "退院支援の一覧", hint: "患者ごとに、退院困難な要因・話合い・計画・カンファレンス・計画書・転院の打診・退院の予定", group: "work", needs: "admit" },
  { key: "meals", label: "病棟の食事", hint: "今日と明日の朝・昼・夕：食種・形態・食止め、食数（コードで数える）と締切", group: "work", needs: "meals" },
  { key: "acuity", label: "看護必要度", hint: "B 項目の評価（5階東）", group: "work", needs: "acuity" },
  { key: "journal", label: "看護日誌", hint: "選んだ階の今日の数（コードで数える）と所感", group: "work", needs: "sheet" },
  { key: "iji", label: "医事課の仕事", hint: "患者ごとに、保険の未登録・退院して会計がまだ・算定の要確認・未コード化の病名", group: "work", needs: "iji" },
  { key: "cosign", label: "研修医の記録の確認", hint: "研修医の記事・オーダ・指示簿で、指導医か上級医の確認がまだのもの（確かめた人と時刻も）", group: "work", needs: "audit" },
  { key: "summaries", label: "退院サマリの一覧", hint: "退院した患者の退院時サマリー：未作成・作成中・差し戻し・承認待ち・承認済と、退院日の翌日から14日の期限（診療録管理体制加算の施設基準）、前月の期限内の割合", group: "work", needs: "audit" },
  { key: "nsummaries", label: "看護サマリの承認", hint: "看護師長が、提出された看護サマリ（退院・転院時・転棟時・中間）を承認するかコメントをつけて差し戻す。中間サマリの期限の近い患者も出す", group: "work", needs: "sheet" },
  { key: "roster", label: "勤務表と様式9", hint: "看護師長が月の勤務を入れ、夜勤時間・月平均72時間・10対1・夜勤の組み合わせをコードで確かめる（5階東）", group: "work", needs: "sheet" },
];

export const wardTabInfo = (t: WardTab): WardTabInfo => WARD_TABS.find((x) => x.key === t)!;

/** Screens that no longer exist, read from what was saved earlier (◯階の患者一覧 became the ward pulldown of 入院患者一覧, 2026-11-04). */
const RENAMED_WARD_TABS: Record<string, WardTab> = { floor: "all" };
/** A saved ② key as the screen it means now (null: unknown). */
export const readWardTab = (key: string): WardTab | null => RENAMED_WARD_TABS[key] ?? WARD_TABS.find((t) => t.key === key)?.key ?? null;

/** The ② screens a role may open inside 病棟. */
export const wardTabsFor = (role: Role): WardTab[] => WARD_TABS.filter((t) => (t.key !== "consults" || role === "医師" || role === "デバッグ") && [t.needs].flat().some((n) => TABS[role].includes(n))).map((t) => t.key);

/** The places (and tools) a role uses, in the menu's order. */
export function areasFor(role: Role): Area[] {
  // デバッグ: every place.
  if (role === "デバッグ") return AREAS.slice();
  const mine = TABS[role];
  return AREAS.filter((a) => {
    if (a.key === "ward") return wardTabsFor(role).length > 0;
    if (a.key === "opd") return role === "医師" || role === "看護師" || role === "医事課";
    if (a.key === "liaison") return role === "医師" || role === "看護師" || role === "MSW" || role === "医事課";
    if (a.key === "receipt") return role === "医事課" || role === "医師";
    if (a.key === "stats") return role === "医師" || role === "看護師" || role === "医事課";
    // 内視鏡室: the endoscopists (doctors) and nurses. 給食: the 管理栄養士, and doctors and nurses to read (検食 by doctors).
    if (a.key === "endo") return role === "医師" || role === "看護師";
    if (a.key === "kitchen") return role === "管理栄養士" || role === "医師" || role === "看護師";
    if (a.key === "teams") return role !== "医事課";
    // 障害時の参照: printed by those who care for the inpatients (their essentials). システム管理: everyone looks; who changes what is in roles.ts.
    if (a.key === "bcp") return role === "医師" || role === "看護師" || role === "薬剤師";
    if (a.key === "system") return true;
    if (EVERYONE.includes(a.key)) return true;
    if (a.key === "extract") return role === "医師" || role === "医事課" || role === "看護師";
    // 病理: the technologists' work, and the report the pathologist (a doctor) writes.
    if (a.key === "path" && role === "医師") return true;
    // 放射線部: the technologists' work, the radiologist's report and the 照射録 the ordering doctor signs.
    if (a.key === "radiology" && role === "医師") return true;
    // リハビリテーション部: the therapists' work; doctors (実施計画書・経過) and nurses (予定) look at it too.
    if (a.key === "rehab" && (role === "医師" || role === "看護師")) return true;
    const need = NEEDS[a.key];
    return !!need && mine.includes(need);
  });
}

/** Where a role starts: the place of its first view (薬剤師 → 薬剤部, 看護師 → 病棟 …). */
export function homeArea(role: Role): AreaKey {
  const first = TABS[role][0];
  return (Object.entries(NEEDS).find(([, v]) => v === first)?.[0] as AreaKey | undefined) ?? "ward";
}

/**
 * The screen a role lands on when chosen (the role's first view in roles.ts): its own place (薬剤師 → 薬剤部,
 * 管理栄養士 → 給食 …), or inside 病棟 the work screen of that view (看護師 → ワークシート, 医事課 → 医事課の仕事,
 * MSW → 入院時の評価). A role whose first view is a patient list (医師) keeps the ward's 最初に開く screens (wardTab null).
 */
export function homeScreen(role: Role): { area: AreaKey; wardTab: WardTab | null } {
  if (role === "管理栄養士") return { area: "kitchen", wardTab: null };
  const area = homeArea(role);
  if (area !== "ward") return { area, wardTab: null };
  const first = TABS[role][0];
  const tab = WARD_TABS.find((t) => t.key === first && t.group === "work");
  return { area, wardTab: tab?.key ?? null };
}

/** Keep only the screens the role may open (for defaults saved earlier, or after a role change); saved keys of renamed screens are read as the screen they became. */
export const allowedWardTabs = (role: Role, tabs: readonly string[]): WardTab[] => {
  const ok = wardTabsFor(role);
  return [...new Set(tabs.flatMap((t) => readWardTab(t) ?? []))].filter((t) => ok.includes(t));
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
  const fallback = (["mine", "all", "map"] as WardTab[]).find((t) => allowed.includes(t)) ?? allowed[0];
  return tabs.map((t) => {
    const w = wardTabOf(t.owner);
    return w && !allowed.includes(w) && fallback ? { ...t, owner: wardOwner(fallback) } : t;
  });
}
