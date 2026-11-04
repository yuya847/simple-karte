// The lab order screen (検体検査): the category tabs and their sub-headings, which picked items cover
// which (a set covers its single items, so they cannot be picked twice), the day and time choices for
// the draw, and the draft the picks become. All of it is worked out by code; the doctor picks.

import { addDays, weekday, type CalendarDate } from "./dates";
import type { LabDraft } from "./drafts";
import { LAB_TESTS, ORDER_SETS, WARD_RULES, findLab, findSet, labInfo, type LabGroup, type LabMaster } from "./master";
import type { LabPriority, OrderEntry } from "./types";

export interface LabTab {
  key: string;
  label: string;
  groups: LabGroup[];
}

/** The tabs, in the order the ward reads them. 院内セット holds the hospital's sets (ORDER_SETS and the 生化学 set). */
export const LAB_TABS: LabTab[] = [
  { key: "sets", label: "院内セット", groups: ["セット"] },
  { key: "cbc", label: "血算・血液像", groups: ["血液学"] },
  { key: "coag", label: "凝固・線溶", groups: ["凝固・線溶"] },
  { key: "chem", label: "生化学", groups: ["生化学"] },
  { key: "infl", label: "炎症・感染症", groups: ["炎症・感染"] },
  { key: "cardiac", label: "心筋・心不全", groups: ["心筋・心不全"] },
  { key: "endo", label: "内分泌", groups: ["内分泌"] },
  { key: "tumor", label: "腫瘍マーカー", groups: ["腫瘍マーカー"] },
  { key: "immuno", label: "免疫・アレルギー", groups: ["免疫・アレルギー"] },
  { key: "gas", label: "血液ガス", groups: ["血液ガス"] },
  { key: "urine", label: "尿・便", groups: ["尿", "便"] },
  { key: "micro", label: "微生物", groups: ["微生物", "微生物（塗抹・遺伝子）"] },
  { key: "tdm", label: "薬物濃度", groups: ["薬物濃度"] },
  { key: "tx", label: "輸血検査", groups: ["輸血検査"] },
];

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
};
const SUBHEAD_ORDER = [
  "血算", "血液像", "そのほか",
  "蛋白", "肝・胆道", "腎", "電解質・微量元素", "脂質", "糖", "膵", "鉄", "筋・肺・そのほか", "ビタミン",
  "炎症マーカー", "肝炎・HIV・梅毒ほか（血清）", "真菌・ウイルス・結核（血清・血液）", "迅速抗原（ぬぐい液・尿）",
  "心不全", "心筋",
  "甲状腺", "副腎", "下垂体", "性腺", "糖代謝", "副甲状腺・骨",
  "尿", "便",
  "培養", "塗抹・遺伝子・抗原",
];

/** Sub-heading of an item: by code, else by group (培養 vs 塗抹・遺伝子), else none. */
export function subheadOf(t: LabMaster): string {
  if (SUBHEAD[t.code]) return SUBHEAD[t.code];
  if (t.group === "微生物") return "培養";
  if (t.group === "微生物（塗抹・遺伝子）") return "塗抹・遺伝子・抗原";
  if (t.group === "尿") return "尿";
  if (t.group === "便") return "便";
  return "";
}

/** Items a tab shows (hidden items and sets left out), grouped under their sub-headings in order. */
export function tabSections(tab: LabTab, tests: readonly LabMaster[]): { head: string; items: LabMaster[] }[] {
  const shown = tests.filter((t) => !t.hidden && t.group && tab.groups.includes(t.group) && !findSet(t.code));
  const heads = [...new Set(shown.map(subheadOf))].sort((a, b) => rank(a) - rank(b));
  return heads.map((head) => ({ head, items: shown.filter((t) => subheadOf(t) === head) }));
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

/** The lab draft the picks become; the checks (checkDraft) then ask what is missing and stop a past time. */
export function labDraftOf(id: string, picked: readonly string[], c: DrawChoice): LabDraft {
  return {
    id,
    origin: "manual",
    sourceText: "（マスターから選択）",
    comment: null,
    kind: "lab",
    tests: picked.map((code) => ({ code, said: labelOf(code) })),
    ...collectOf(c),
    cultureSets: null,
    duplicateOk: false,
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
