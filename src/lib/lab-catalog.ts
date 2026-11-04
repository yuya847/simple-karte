// The lab order screen (検体検査): the category tabs and their sub-headings, which picked items cover
// which (a set covers its single items, so they cannot be picked twice), the day and time choices for
// the draw, and the draft the picks become. All of it is worked out by code; the doctor picks.

import { addDays, weekday, type CalendarDate } from "./dates";
import type { LabDraft } from "./drafts";
import { LAB_TESTS, ORDER_SETS, WARD_RULES, findLab, findSet, labInfo, type LabGroup, type LabMaster } from "./master";
import type { LabPriority, LabSite, OrderEntry } from "./types";

export interface LabTab {
  key: string;
  label: string;
  /** Master groups shown on this tab (an item of the group goes here unless TAB_OF moves it). */
  groups: LabGroup[];
}

/**
 * The tabs, in the order of a lab order screen in wide use (the layout of a published operating
 * manual's screen was the reference: 生化学Ⅰ / 血液学・凝固系 / 血清学 / 尿・髄液 …). 頻用 comes first
 * and holds FREQUENT_CODES. Sets are not a tab: they sit on the left (lab-sets.ts).
 */
export const LAB_TABS: LabTab[] = [
  { key: "freq", label: "頻用", groups: [] },
  { key: "chem1", label: "生化学Ⅰ", groups: ["生化学", "心筋・心不全"] },
  { key: "chem2", label: "生化学Ⅱ", groups: [] },
  { key: "heme", label: "血液学・凝固系", groups: ["血液学", "凝固・線溶"] },
  { key: "sero", label: "血清学・免疫", groups: ["免疫・アレルギー"] },
  { key: "urine", label: "尿・髄液・便", groups: ["尿", "便"] },
  { key: "micro", label: "微生物", groups: ["微生物", "微生物（塗抹・遺伝子）"] },
  { key: "tx", label: "輸血関連", groups: ["輸血検査"] },
  { key: "tdm", label: "薬物濃度", groups: ["薬物濃度"] },
  { key: "tumor", label: "腫瘍マーカー", groups: ["腫瘍マーカー"] },
  { key: "endo", label: "内分泌", groups: ["内分泌"] },
  { key: "infect", label: "感染症（ウイルスを含む）", groups: ["炎症・感染"] },
  { key: "allergy", label: "アレルギー", groups: [] },
  { key: "other", label: "その他", groups: ["血液ガス"] },
];

/**
 * 頻用: the items the ward orders most, in the order they are read (血算・分画・CRP, the routine
 * chemistry, 凝固, BNP, 尿一般, 血液培養, 動脈血ガス). The fictional hospital's rule; eGFR is worked out
 * from Cre and is not an item.
 */
export const FREQUENT_CODES: readonly string[] = [
  "LAB-CBC", "LAB-DIFF", "LAB-CRP",
  "LAB-TP", "LAB-ALB", "LAB-AST", "LAB-ALT", "LAB-LD", "LAB-ALP", "LAB-GGT", "LAB-TBIL",
  "LAB-BUN", "LAB-CRE", "LAB-URIC", "LAB-NA", "LAB-K", "LAB-CL", "LAB-CA", "LAB-GLU", "LAB-HBA1C",
  "LAB-PT", "LAB-APTT", "LAB-DD", "LAB-BNP",
  "LAB-UA", "LAB-BCX", "LAB-BGA",
];

/** Items moved off their group's tab: special chemistry to 生化学Ⅱ, CRP and 炎症マーカー next to the routine chemistry, allergy out of 免疫. */
const TAB_OF: Record<string, string> = {
  "LAB-CRP": "chem1", "LAB-PCT": "chem1", "LAB-PSEP": "chem1",
  "LAB-PREALB": "chem2", "LAB-SPEP": "chem2", "LAB-HPT": "chem2", "LAB-CYSC": "chem2", "LAB-B2MG": "chem2", "LAB-OSM": "chem2",
  "LAB-ZN": "chem2", "LAB-CU": "chem2", "LAB-FERRITIN": "chem2", "LAB-LAC": "chem2", "LAB-KL6": "chem2",
  "LAB-VB12": "chem2", "LAB-FOL": "chem2", "LAB-VB1": "chem2", "LAB-VD25": "chem2",
  "LAB-IGE": "allergy", "LAB-SIGE": "allergy",
};

/** The tab an item sits on (every offered item sits on exactly one; sets on none). */
export function tabOf(t: LabMaster): string | null {
  if (TAB_OF[t.code]) return TAB_OF[t.code];
  if (!t.group || t.group === "セット") return null;
  return LAB_TABS.find((tab) => tab.groups.includes(t.group!))?.key ?? null;
}

/** 迅速対応: run in house, answered the same day (shown in red on the screen, like the manual's screen). */
export const isRapid = (code: string) => /^院内・(当日|すぐ)$/.test(labInfo(code).tat);

/** Sub-headings inside a tab, by item code; items without one go under the tab's first heading. */
const SUBHEAD: Record<string, string> = {
  // 血算・血液像
  "LAB-CBC": "血算", "LAB-WBC": "血算", "LAB-RBC": "血算", "LAB-HB": "血算", "LAB-HT": "血算", "LAB-PLT": "血算",
  "LAB-DIFF": "血液像", "LAB-MDIFF": "血液像",
  "LAB-RET": "そのほか", "LAB-ESR": "そのほか",
  // 生化学
  "LAB-TP": "蛋白", "LAB-ALB": "蛋白", "LAB-PREALB": "蛋白", "LAB-SPEP": "蛋白", "LAB-HPT": "蛋白",
  "LAB-AST": "肝・胆道", "LAB-ALT": "肝・胆道", "LAB-LD": "肝・胆道", "LAB-ALP": "肝・胆道", "LAB-GGT": "肝・胆道", "LAB-TBIL": "肝・胆道", "LAB-DBIL": "肝・胆道", "LAB-CHE": "肝・胆道", "LAB-NH3": "肝・胆道",
  "LAB-BUN": "腎", "LAB-CRE": "腎", "LAB-URIC": "腎", "LAB-CYSC": "腎", "LAB-B2MG": "腎", "LAB-OSM": "腎",
  "LAB-NA": "電解質・微量元素", "LAB-K": "電解質・微量元素", "LAB-CL": "電解質・微量元素", "LAB-CA": "電解質・微量元素", "LAB-IP": "電解質・微量元素", "LAB-MG": "電解質・微量元素", "LAB-ZN": "電解質・微量元素", "LAB-CU": "電解質・微量元素",
  "LAB-TG": "脂質", "LAB-TCHO": "脂質", "LAB-HDL": "脂質", "LAB-LDL": "脂質",
  "LAB-GLU": "糖",
  "LAB-AMY": "膵", "LAB-PAMY": "膵", "LAB-LIP": "膵",
  "LAB-FE": "鉄", "LAB-UIBC": "鉄", "LAB-FERRITIN": "鉄",
  "LAB-CK": "筋・肺・そのほか", "LAB-LAC": "筋・肺・そのほか", "LAB-KL6": "筋・肺・そのほか",
  "LAB-VB12": "ビタミン", "LAB-FOL": "ビタミン", "LAB-VB1": "ビタミン", "LAB-VD25": "ビタミン",
  // 炎症・感染症
  "LAB-CRP": "炎症マーカー", "LAB-PCT": "炎症マーカー", "LAB-PSEP": "炎症マーカー", "LAB-BDG": "炎症マーカー",
  "LAB-HBSAG": "肝炎・HIV・梅毒ほか（血清）", "LAB-HBSAB": "肝炎・HIV・梅毒ほか（血清）", "LAB-HBCAB": "肝炎・HIV・梅毒ほか（血清）", "LAB-HCVAB": "肝炎・HIV・梅毒ほか（血清）", "LAB-HIV": "肝炎・HIV・梅毒ほか（血清）", "LAB-TPAB": "肝炎・HIV・梅毒ほか（血清）", "LAB-RPR": "肝炎・HIV・梅毒ほか（血清）", "LAB-HTLV1": "肝炎・HIV・梅毒ほか（血清）",
  "LAB-ASPAG": "真菌・ウイルス・結核（血清・血液）", "LAB-CRAG": "真菌・ウイルス・結核（血清・血液）", "LAB-CMVAG": "真菌・ウイルス・結核（血清・血液）", "LAB-IGRA": "真菌・ウイルス・結核（血清・血液）", "LAB-MYCOAB": "真菌・ウイルス・結核（血清・血液）",
  "LAB-FLUAG": "迅速抗原（ぬぐい液・尿）", "LAB-COVAG": "迅速抗原（ぬぐい液・尿）", "LAB-COVFLUAG": "迅速抗原（ぬぐい液・尿）", "LAB-PNEUUAG": "迅速抗原（ぬぐい液・尿）", "LAB-LEGUAG": "迅速抗原（ぬぐい液・尿）",
  // 心筋・心不全
  "LAB-BNP": "心不全", "LAB-NTBNP": "心不全", "LAB-TNT": "心筋", "LAB-TNI": "心筋", "LAB-CKMB": "心筋",
  // 内分泌
  "LAB-TSH": "甲状腺", "LAB-FT4": "甲状腺", "LAB-FT3": "甲状腺", "LAB-TRAB": "甲状腺", "LAB-TPOAB": "甲状腺", "LAB-TGAB": "甲状腺",
  "LAB-CORT": "副腎", "LAB-ACTH": "副腎", "LAB-ALD": "副腎", "LAB-PRA": "副腎",
  "LAB-PRL": "下垂体", "LAB-GH": "下垂体", "LAB-IGF1": "下垂体", "LAB-ADH": "下垂体",
  "LAB-LH": "性腺", "LAB-FSH": "性腺", "LAB-E2": "性腺", "LAB-TESTO": "性腺",
  "LAB-HBA1C": "糖代謝", "LAB-GA": "糖代謝", "LAB-IRI": "糖代謝", "LAB-CPR": "糖代謝",
  "LAB-PTH": "副甲状腺・骨",
  // 尿・便
  "LAB-UA": "尿", "LAB-UPRO": "尿", "LAB-UALB": "尿", "LAB-UNA": "尿", "LAB-UK": "尿", "LAB-UCRE": "尿", "LAB-UUN": "尿", "LAB-UOSM": "尿", "LAB-UHCG": "尿",
  "LAB-FOBT": "便",
  // 血清学・免疫 / アレルギー
  "LAB-IGG": "免疫グロブリン", "LAB-IGA": "免疫グロブリン", "LAB-IGM": "免疫グロブリン", "LAB-IGG4": "免疫グロブリン",
  "LAB-RF": "自己抗体", "LAB-ANA": "自己抗体", "LAB-DSDNA": "自己抗体", "LAB-MPO": "自己抗体", "LAB-PR3": "自己抗体", "LAB-ACPA": "自己抗体",
  "LAB-C3": "補体", "LAB-C4": "補体", "LAB-CH50": "補体",
  "LAB-IGE": "アレルギー", "LAB-SIGE": "アレルギー",
  // その他
  "LAB-BGA": "血液ガス", "LAB-VBG": "血液ガス",
};
const SUBHEAD_ORDER = [
  "血算", "血液像", "そのほか", "凝固・線溶",
  "蛋白", "肝・胆道", "腎", "電解質・微量元素", "脂質", "糖", "膵", "鉄", "筋・肺・そのほか", "ビタミン",
  "炎症マーカー", "肝炎・HIV・梅毒ほか（血清）", "真菌・ウイルス・結核（血清・血液）", "迅速抗原（ぬぐい液・尿）",
  "心不全", "心筋",
  "甲状腺", "副腎", "下垂体", "性腺", "糖代謝", "副甲状腺・骨",
  "尿", "便",
  "培養", "塗抹・遺伝子・抗原",
  "免疫グロブリン", "自己抗体", "補体", "アレルギー", "血液ガス",
];

/** Sub-heading of an item: by code, else by group (培養 vs 塗抹・遺伝子), else none. */
export function subheadOf(t: LabMaster): string {
  if (SUBHEAD[t.code]) return SUBHEAD[t.code];
  if (t.group === "微生物") return "培養";
  if (t.group === "微生物（塗抹・遺伝子）") return "塗抹・遺伝子・抗原";
  if (t.group === "凝固・線溶") return "凝固・線溶";
  if (t.group === "尿") return "尿";
  if (t.group === "便") return "便";
  return "";
}

/**
 * Items a tab shows (hidden items and sets left out), grouped under their sub-headings in order.
 * 頻用 lists FREQUENT_CODES in their own order under one heading.
 */
export function tabSections(tab: LabTab, tests: readonly LabMaster[]): { head: string; items: LabMaster[] }[] {
  if (tab.key === "freq") {
    const items = FREQUENT_CODES.map((c) => tests.find((t) => t.code === c && !t.hidden)).filter((t): t is LabMaster => !!t);
    return items.length ? [{ head: "", items }] : [];
  }
  const shown = tests.filter((t) => !t.hidden && tabOf(t) === tab.key && !findSet(t.code));
  const heads = [...new Set(shown.map(subheadOf))].sort((a, b) => rank(a) - rank(b));
  return heads.map((head) => ({ head, items: shown.filter((t) => subheadOf(t) === head) }));
}

/** Hiragana to katakana, full width to half width, lower case: so "でぃーだいまー" and "Ｄダイマー" both find Dダイマー. */
export function searchKey(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(/[\s・･‐－-]/g, "")
    .toLowerCase();
}

/** 項目検索: items whose name, abbreviation or aliases contain the words (kana and width do not matter). Sets are not searched. */
export function searchLabs(query: string, tests: readonly LabMaster[], limit = 30): LabMaster[] {
  const q = searchKey(query);
  if (!q) return [];
  return tests.filter((t) => !t.hidden && t.group !== "セット" && !findSet(t.code) && [t.abbr ?? "", t.name, ...t.aliases].some((a) => searchKey(a).includes(q))).slice(0, limit);
}

/** 重複削除: picked items that another picked item already reports (WBC next to 血算, PT-INR next to PT) are taken out. */
export function dedupePicks(picked: readonly string[]): string[] {
  const out: string[] = [];
  picked.forEach((c, i) => {
    if (out.includes(c)) return;
    const mine = analytesOf(c);
    // Dropped when another pick reports all of its analytes: more of them, or the same ones and picked earlier (PT before PT-INR).
    const dropped = picked.some((p, j) => {
      if (p === c) return false;
      const theirs = new Set(analytesOf(p));
      if (!mine.every((a) => theirs.has(a))) return false;
      return theirs.size !== new Set(mine).size || j < i;
    });
    if (!dropped) out.push(c);
  });
  return out;
}

/** The picked items another picked item covers (what 重複削除 would take out). */
export function duplicatePicks(picked: readonly string[]): string[] {
  const kept = dedupePicks(picked);
  return picked.filter((c) => !kept.includes(c));
}
const rank = (h: string) => {
  const i = SUBHEAD_ORDER.indexOf(h);
  return i < 0 ? SUBHEAD_ORDER.length : i;
};

/** A thing that can be picked on the screen: a hospital set (SET-…) or a lab item (LAB-…). */
export interface Pickable {
  code: string;
  label: string;
  /** Full name shown on the button's title and in the picked list. */
  title: string;
}

/** What the 院内セット tab offers: the hospital's sets and the items whose group is セット (the 生化学 set). */
export function setPickables(tests: readonly LabMaster[]): Pickable[] {
  const sets = ORDER_SETS.map((s) => ({ code: s.code, label: s.name, title: s.labCodes.map((c) => findLab(c)?.abbr ?? c).join("・") }));
  const setItems = tests.filter((t) => t.group === "セット" && !t.hidden).map((t) => ({ code: t.code, label: t.abbr ?? t.name, title: `${t.name}：${(t.contains ?? []).join("・")}` }));
  return [...sets, ...setItems];
}

/** Analytes a picked code reports (a set: all of its items'); an item without analytes stands for itself. */
export function analytesOf(code: string): string[] {
  const set = findSet(code);
  if (set) return [...new Set(set.labCodes.flatMap(analytesOf))];
  const t = findLab(code);
  return t?.contains ?? [code];
}

/**
 * The picked code (other than itself) whose analytes include all of this one's — the item is then
 * "含まれる" and cannot be picked. A pair with the same analytes (PT と PT-INR) covers each other, so
 * only one of the two can be picked.
 */
export function coveredBy(code: string, picked: readonly string[]): string | null {
  const mine = analytesOf(code);
  if (mine.length === 0) return null;
  for (const p of picked) {
    if (p === code) continue;
    const theirs = new Set(analytesOf(p));
    if (mine.every((a) => theirs.has(a))) return p;
  }
  return null;
}

/** Add or remove a code. Adding a set drops the single items it covers (they would be drawn twice). */
export function togglePick(picked: readonly string[], code: string): string[] {
  if (picked.includes(code)) return picked.filter((c) => c !== code);
  if (coveredBy(code, picked)) return [...picked];
  const mine = new Set(analytesOf(code));
  return [...picked.filter((p) => !analytesOf(p).every((a) => mine.has(a))), code];
}

export function labelOf(code: string): string {
  const set = findSet(code);
  if (set) return set.name;
  const t = findLab(code);
  return t ? (t.abbr ?? t.name) : code;
}
export function titleOf(code: string): string {
  const set = findSet(code);
  if (set) return set.labCodes.map((c) => findLab(c)?.name ?? c).join("、");
  return findLab(code)?.name ?? code;
}

/** Containers and notes of the picked items, sets opened up. */
export function pickedSummary(picked: readonly string[]): { labCodes: string[]; containers: string[]; notes: string[] } {
  const labCodes = [...new Set(picked.flatMap((c) => findSet(c)?.labCodes ?? [c]))];
  const containers = [...new Set(labCodes.map((c) => labInfo(c).container))];
  const notes = labCodes.flatMap((c) => (labInfo(c).note ? [`${labelOf(c)}：${labInfo(c).note}`] : []));
  return { labCodes, containers, notes };
}

// ---------- when to draw ----------

/** Days a draw can be set for: today and the next 7 days, each with its weekday. */
export function dayOptions(today: CalendarDate, days = 7): { day: number; label: string }[] {
  return Array.from({ length: days + 1 }, (_, day) => {
    const d = addDays(today, day);
    return { day, label: `${day === 0 ? "今日 " : day === 1 ? "明日 " : ""}${d.m}/${d.d}（${weekday(d)}）` };
  });
}

/** Clock times the ward draws at (the routine draw first). The fictional hospital's rule. */
export const DRAW_TIMES: readonly string[] = [WARD_RULES.routineDrawTime, "10:00", "14:00", "18:00"];

export const isHHMM = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export type DrawMode = "now" | "routine" | "time" | "before_dose";

export interface DrawChoice {
  mode: DrawMode;
  /** Day offset from today (routine and time). */
  day: number;
  /** "HH:MM" for a chosen time. */
  time: string;
  priority: LabPriority;
  /** For a drug level: the N-th dose of a timed injection running or drafted. */
  beforeDose: { n: number; drugCode: string } | null;
}

export const defaultDraw = (): DrawChoice => ({ mode: "routine", day: 1, time: WARD_RULES.routineDrawTime, priority: "定時", beforeDose: null });

/** The draw as the draft's `collect` and `priority` (checkDraft resolves and checks it, e.g. a past time). */
export function collectOf(c: DrawChoice): Pick<LabDraft, "collect" | "priority"> {
  if (c.mode === "now") return { collect: { day: 0, when: "now", time: null, beforeDose: null }, priority: "至急" };
  if (c.mode === "before_dose") return { collect: { day: null, when: "before_dose", time: null, beforeDose: c.beforeDose ?? { n: null, drugCode: null } }, priority: c.priority };
  if (c.mode === "routine") return { collect: { day: c.day, when: "morning_routine", time: null, beforeDose: null }, priority: c.priority };
  return { collect: { day: c.day, when: "specific_time", time: isHHMM(c.time) ? c.time : null, beforeDose: null }, priority: c.priority };
}

/** Why the draw cannot be made into a draft yet (null when it can). */
export function drawProblem(c: DrawChoice): string | null {
  if (c.mode === "time" && !isHHMM(c.time)) return "時刻を HH:MM で入れてください（例 09:30）。";
  if (c.mode === "before_dose" && !c.beforeDose) return "どの薬の何回目の投与前かを選んでください。";
  return null;
}

/** One line that says when the draw is, for the fixed summary. */
export function drawText(c: DrawChoice, today: CalendarDate): string {
  if (c.mode === "now") return "今すぐ（至急）";
  if (c.mode === "before_dose") return c.beforeDose ? `${c.beforeDose.n}回目の投与の${WARD_RULES.minutesBeforeDoseForLevel}分前（${c.priority}）` : "投与前（薬を選ぶ）";
  const d = addDays(today, c.day);
  const when = c.mode === "routine" ? `定時採血 ${WARD_RULES.routineDrawTime}` : c.time;
  return `${d.m}/${d.d}（${weekday(d)}） ${when}（${c.priority}）`;
}

/** Comments the ward writes often (the combo box offers them; anything else can be typed). The fictional hospital's list. */
export const LAB_COMMENT_OPTIONS: readonly string[] = ["至急でお願いします", "採血困難（細い針で）", "ヘパリンロックから採取", "輸液と反対側から採取", "食後採血", "絶食で採取", "動脈ラインから採取", "結果が出たら電話連絡"];

/** What the right column adds to the picks: the items 至急 on their own, where to draw, the comment and the purpose. */
export interface LabExtras {
  urgent?: readonly string[];
  site?: LabSite | null;
  comment?: string | null;
  purpose?: string | null;
}

/**
 * The lab draft the picks become; the checks (checkDraft) then ask what is missing and stop a past
 * time. Every item 至急 is the whole order 至急 (the same as the 至急 box); some of them 至急 is kept per item.
 */
export function labDraftOf(id: string, picked: readonly string[], c: DrawChoice, extras: LabExtras = {}): LabDraft {
  const urgent = new Set(extras.urgent ?? []);
  const all = picked.length > 0 && picked.every((code) => urgent.has(code));
  const base = collectOf(c);
  return {
    id,
    origin: "manual",
    sourceText: "（マスターから選択）",
    comment: extras.comment?.trim() || null,
    kind: "lab",
    tests: picked.map((code) => ({ code, said: labelOf(code), ...(urgent.has(code) ? { urgent: true } : {}) })),
    ...base,
    priority: all ? "至急" : base.priority,
    cultureSets: null,
    duplicateOk: false,
    site: extras.site ?? null,
    purpose: extras.purpose?.trim() || null,
  };
}

/** Drugs a level can be timed to: injections running every N hours (first drug of each order). */
export function levelDrugsFrom(entries: readonly OrderEntry[], name: (code: string) => string): { code: string; name: string }[] {
  const out: { code: string; name: string }[] = [];
  for (const e of entries) {
    if (e.status !== "有効" || e.order.type !== "injection" || e.order.schedule.kind !== "every_hours") continue;
    const code = e.order.items[0]?.drugCode;
    if (code && !out.some((x) => x.code === code)) out.push({ code, name: name(code) });
  }
  return out;
}

/** All items the screen can offer (hidden ones left out), for counts and tests. */
export const offeredTests = () => LAB_TESTS.filter((t) => !t.hidden);
