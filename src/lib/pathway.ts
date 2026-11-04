// クリティカルパス: the fictional hospital's day-by-day plans for a diagnosis (検査・リハビリ・指導の依頼、
// 観察・ケア、その日のアウトカム). The doctor decides whether to use one; applying it puts the chosen days'
// orders in as drafts that the doctor checks and confirms like any other. Drugs are never in a path: the
// doctor chooses them for each patient. Nurses and doctors evaluate each day's outcomes (達成／未達成);
// a 未達成, a change or leaving the path is recorded as a バリアンス with its reason. The paths' contents
// are this fictional hospital's agreement, not taken from a guideline. All data is fictional.

import { newProcedureDraft, type Draft, type LabDraft } from "./drafts";
import { emptyImaging, emptyPhysio, findPhysio } from "./exams";
import { LAB_TESTS } from "./master";
import type { DayOffset, GuideOrder, OrderEntry, RehabOrder } from "./types";

export const PATH_SOURCES = {
  spec: {
    label: "電子カルテ標準仕様研究会「電子カルテシステム標準仕様書 v1.0」2.05 パス管理（2 パスマスタの作成・3 パスの適用とカレンダ・5 パス一覧・7 バリアンス・9 日単位の指示一覧とアウトカム）",
    url: "http://hci-bc.com/pdf/StandardSpec_v1body_c.pdf",
  },
};

export const PATH_RULES = {
  content: "パスの日程・検査・観察・アウトカムは架空の病院の取り決めです（ガイドラインから取ったものではありません）。使うかどうかは医師が決めます。",
  drugs: "抗菌薬・利尿薬・輸液・酸素などの薬と量はパスに入れません。医師が患者ごとに選んでオーダします。",
  variance: "バリアンスの分類は架空の病院の取り決めです。",
};

export type PathWho = "看護師" | "医師";

export interface PathOutcome {
  key: string;
  text: string;
  /** Who evaluates it. */
  who: PathWho;
}

export type PathOrder =
  | { kind: "lab"; codes: string[]; cultureSets?: number }
  | { kind: "imaging"; region: string; label: string }
  | { kind: "physio"; test: string }
  | { kind: "rehab"; rehab: Pick<RehabOrder, "field" | "therapists" | "goal"> }
  | { kind: "guide"; guide: GuideOrder };

export interface PathDay {
  /** 1 = the day the path starts (入院日). */
  day: number;
  orders: PathOrder[];
  /** 観察・ケア・説明 for the ward (words only; not orders). */
  care: string[];
  outcomes: PathOutcome[];
}

export interface Pathway {
  code: string;
  name: string;
  /** Who it is for, and when not to use it (the doctor decides). */
  target: string;
  exclusions: string;
  /** 標準の日数（入院日を1日目、退院日を最後の日として）. */
  length: number;
  days: PathDay[];
}

const lab = (codes: string[], cultureSets?: number): PathOrder => ({ kind: "lab", codes, ...(cultureSets ? { cultureSets } : {}) });
const chestXray: PathOrder = { kind: "imaging", region: "R-CHEST", label: "胸部X線" };
const guide = (kind: GuideOrder["kind"], note: string): PathOrder => ({ kind: "guide", guide: { kind, note } });
const o = (key: string, text: string, who: PathWho): PathOutcome => ({ key, text, who });
const day = (n: number, x: Partial<Omit<PathDay, "day">> = {}): PathDay => ({ day: n, orders: x.orders ?? [], care: x.care ?? [], outcomes: x.outcomes ?? [] });

/** The fictional hospital's path master (架空の病院の取り決め). */
export const PATHWAYS: Pathway[] = [
  {
    code: "PATH-ASPN",
    name: "誤嚥性肺炎",
    target: "誤嚥性肺炎で入院した患者",
    exclusions: "人工呼吸が要るとき・ショックのとき・ほかの病気の治療を同時に進めるときは使わない",
    length: 10,
    days: [
      day(1, {
        orders: [lab(["LAB-CBC", "LAB-DIFF", "LAB-CHEM", "LAB-CRP"]), lab(["LAB-BCX"], 2), chestXray],
        care: ["嚥下の評価が済むまで、食事は医師の指示を待つ", "口腔ケア（1日3回）", "体位とベッドの頭の高さは看護計画で決める"],
        outcomes: [o("a1-1", "入院時のバイタル・SpO2・意識が記録されている", "看護師"), o("a1-2", "抗菌薬が医師の選んだ内容で始まっている", "医師")],
      }),
      day(2, {
        orders: [{ kind: "rehab", rehab: { field: "呼吸器", therapists: ["PT", "ST"], goal: "離床と、嚥下の評価・訓練" } }],
        care: ["言語聴覚士による嚥下の評価"],
        outcomes: [o("a2-1", "嚥下の評価を見て、食事を始めるか・形態を医師が決めた", "医師"), o("a2-2", "ベッドの外で過ごす時間がある（離床）", "看護師")],
      }),
      day(3, { orders: [lab(["LAB-CBC", "LAB-DIFF", "LAB-CHEM", "LAB-CRP"])], outcomes: [o("a3-1", "37.5℃以上の発熱が24時間ない", "看護師"), o("a3-2", "検査の結果を見て、治療を続けるかを医師が決めた", "医師")] }),
      day(4, { outcomes: [o("a4-1", "食事を始めた人は、むせ込みが記録されていない", "看護師")] }),
      day(5, { outcomes: [o("a5-1", "酸素を使わずに SpO2 が指示の範囲にある", "看護師")] }),
      day(6, { orders: [guide("栄養食事指導", "退院後の食事の形態（家族へ）")] }),
      day(7, { orders: [lab(["LAB-CBC", "LAB-CHEM", "LAB-CRP"]), chestXray], outcomes: [o("a7-1", "抗菌薬を終えるか内服に変えるかを医師が決めた", "医師")] }),
      day(8, { orders: [guide("退院時の生活指導", "口腔ケア・食べ方・受診の目安")], outcomes: [o("a8-1", "退院先と退院日が決まっている", "医師")] }),
      day(9, { outcomes: [o("a9-1", "患者・家族が食べ方と口腔ケアの説明を受けた", "看護師")] }),
      day(10, { outcomes: [o("a10-1", "退院の基準を満たす（発熱がない・食事が摂れる・酸素がいらない）", "医師")] }),
    ],
  },
  {
    code: "PATH-HF",
    name: "心不全（急性増悪）",
    target: "慢性心不全の急性増悪で入院した患者",
    exclusions: "急性冠症候群・人工呼吸・強心薬の持続投与が要るときは使わない",
    length: 14,
    days: [
      day(1, {
        orders: [lab(["LAB-CBC", "LAB-CHEM", "LAB-BNP"]), chestXray, { kind: "physio", test: "PHY-ECG" }],
        care: ["毎朝の体重と水分出納（指示簿で指示）", "安静度は指示簿で"],
        outcomes: [o("h1-1", "入院時の体重と水分出納の記録が始まっている", "看護師"), o("h1-2", "安静度・水分と塩分の制限を医師が指示簿と食事で決めた", "医師")],
      }),
      day(2, { orders: [{ kind: "physio", test: "PHY-UCG" }], outcomes: [o("h2-1", "呼吸困難が入院時より軽い（患者の言葉で記録）", "看護師")] }),
      day(3, {
        orders: [lab(["LAB-CHEM"]), { kind: "rehab", rehab: { field: "心大血管疾患", therapists: ["PT"], goal: "心臓リハビリテーション（離床から）" } }],
        outcomes: [o("h3-1", "体重が入院時より減っている", "看護師"), o("h3-2", "腎機能・電解質を見て、利尿薬の量を医師が決めた", "医師")],
      }),
      day(4),
      day(5, { orders: [guide("栄養食事指導", "減塩の食事")], outcomes: [o("h5-1", "酸素を使わずに SpO2 が指示の範囲にある", "看護師")] }),
      day(6),
      day(7, { orders: [lab(["LAB-CBC", "LAB-CHEM", "LAB-BNP"]), chestXray, guide("服薬指導", "心不全の薬と飲み方")], outcomes: [o("h7-1", "病棟内を歩いても息切れが強くならない", "看護師"), o("h7-2", "注射の薬を内服に切り替えるかを医師が決めた", "医師")] }),
      day(8),
      day(9),
      day(10, { orders: [guide("退院時の生活指導", "毎日の体重・症状の記録と受診の目安")], outcomes: [o("h10-1", "患者・家族が体重の記録と受診の目安を説明できる", "看護師")] }),
      day(11),
      day(12, { outcomes: [o("h12-1", "退院先と退院日、退院後の外来が決まっている", "医師")] }),
      day(13),
      day(14, { outcomes: [o("h14-1", "退院の基準を満たす（うっ血の症状がない・体重が目標に近い・内服で安定）", "医師")] }),
    ],
  },
  {
    code: "PATH-CELL",
    name: "蜂窩織炎（下肢）",
    target: "下肢の蜂窩織炎で入院した患者",
    exclusions: "壊死性の感染を疑うとき・手術が要るときは使わない",
    length: 7,
    days: [
      day(1, {
        orders: [lab(["LAB-CBC", "LAB-DIFF", "LAB-CHEM", "LAB-CRP"]), lab(["LAB-BCX"], 2)],
        care: ["発赤の範囲に印をつけ、毎日範囲を記録する", "患肢を挙上する"],
        outcomes: [o("c1-1", "発赤の範囲が記録されている", "看護師"), o("c1-2", "抗菌薬が医師の選んだ内容で始まっている", "医師")],
      }),
      day(2, { outcomes: [o("c2-1", "発赤が印を越えて広がっていない", "看護師")] }),
      day(3, { orders: [lab(["LAB-CBC", "LAB-CRP"])], outcomes: [o("c3-1", "37.5℃以上の発熱が24時間ない", "看護師"), o("c3-2", "培養の結果を見て、抗菌薬を続けるか変えるかを医師が決めた", "医師")] }),
      day(4, { orders: [guide("退院時の生活指導", "足の清潔・保湿・傷の手当てと受診の目安")] }),
      day(5, { outcomes: [o("c5-1", "内服に変えるかを医師が決めた", "医師")] }),
      day(6, { outcomes: [o("c6-1", "患者が足のケアと受診の目安を説明できる", "看護師")] }),
      day(7, { outcomes: [o("c7-1", "退院の基準を満たす（発熱がない・発赤が縮小・歩ける）", "医師")] }),
    ],
  },
];

export const findPath = (code: string) => PATHWAYS.find((p) => p.code === code);

// ---------------------------------------------------------------------------
// One patient's path
// ---------------------------------------------------------------------------

export const VARIANCE_CATEGORIES = ["患者の病状", "患者・家族の希望", "医療者", "病院の仕組み", "退院先・社会的なこと"] as const;
export type VarianceCategory = (typeof VARIANCE_CATEGORIES)[number];
export const VARIANCE_HINTS: Record<VarianceCategory, string> = {
  患者の病状: "合併症・発熱が続く・検査の値など",
  "患者・家族の希望": "退院の日・治療の希望など",
  医療者: "指示・実施・説明が遅れた",
  病院の仕組み: "検査の予約が取れない・休日など",
  "退院先・社会的なこと": "施設の空き・介護の準備など",
};

export interface PathApplication {
  id: string;
  patientId: string;
  code: string;
  /** Day offset of 1日目. */
  startDay: DayOffset;
  by: string;
  at: { day: DayOffset; time: string };
  /** Order items put in as drafts, by item key ("3-0" = 3日目の1つ目). */
  expanded: string[];
  end?: { kind: "完了" | "離脱"; by: string; at: { day: DayOffset; time: string }; reason: string };
}

export interface OutcomeEval {
  id: string;
  appId: string;
  day: number;
  key: string;
  result: "達成" | "未達成";
  by: string;
  role: string;
  at: { day: DayOffset; time: string };
  note?: string;
}

export interface Variance {
  id: string;
  appId: string;
  /** The path day it is about. */
  day: number;
  /** The outcome not met, when it is about one. */
  outcomeKey?: string;
  /** 負 = 予定より遅れる・外れる、正 = 予定より早く進む. */
  sign: "負" | "正";
  category: VarianceCategory;
  detail: string;
  by: string;
  at: { day: DayOffset; time: string };
}

export interface PathBook {
  apps: PathApplication[];
  evals: OutcomeEval[];
  variances: Variance[];
}

export const EMPTY_PATHS: PathBook = { apps: [], evals: [], variances: [] };

/** The path day (1-based) of a day offset. */
export const pathDayOf = (app: Pick<PathApplication, "startDay">, d: DayOffset) => d - app.startDay + 1;

export const activePath = (book: PathBook, patientId: string) => book.apps.find((a) => a.patientId === patientId && !a.end);

export const itemKey = (day: number, i: number) => `${day}-${i}`;

/** The comment put on each order from a path, so the overview can find it once confirmed. */
export const pathTag = (path: Pathway, day: number) => `パス：${path.name} ${day}日目`;

export function orderLabel(it: PathOrder): string {
  if (it.kind === "lab") return `${it.codes.map((c) => LAB_TESTS.find((t) => t.code === c)?.abbr ?? c).join("・")}${it.cultureSets ? `（${it.cultureSets}セット）` : ""}`;
  if (it.kind === "imaging") return it.label;
  if (it.kind === "physio") return findPhysio(it.test)?.name ?? it.test;
  if (it.kind === "rehab") return `リハビリ（${it.rehab.field}・${it.rehab.therapists.join("・")}）`;
  return `${it.guide.kind}の依頼`;
}

export const orderKindLabel = (it: PathOrder) => ({ lab: "検体検査", imaging: "画像", physio: "生理", rehab: "リハビリ", guide: "指導" })[it.kind];

/** The chosen items as drafts, each on its own day (nothing confirmed; the usual checks ask what is missing). */
export function expandPath(path: Pathway, startDay: DayOffset, keys: string[], newId: () => string): Draft[] {
  return path.days.flatMap((d) =>
    d.orders.flatMap((it, i): Draft[] => {
      if (!keys.includes(itemKey(d.day, i))) return [];
      const id = newId();
      const on = startDay + d.day - 1;
      const tag = pathTag(path, d.day);
      const src = `（${tag}）`;
      if (it.kind === "lab") {
        const x: LabDraft = { id, origin: "manual", sourceText: src, comment: tag, kind: "lab", tests: it.codes.map((code) => ({ code, said: code })), collect: { day: on, when: "morning_routine", time: null, beforeDose: null }, priority: "定時", cultureSets: it.cultureSets ?? null, duplicateOk: false };
        return [x];
      }
      if (it.kind === "imaging") return [{ ...emptyImaging(id, "X線"), sourceText: src, comment: tag, region: it.region, when: { day: on, time: null, priority: null } }];
      if (it.kind === "physio") return [{ ...emptyPhysio(id, it.test), sourceText: src, comment: tag, when: { day: on, time: null, priority: null } }];
      if (it.kind === "rehab") return [{ ...newProcedureDraft("PROC-REHAB", id), sourceText: src, comment: tag, rehab: { ...it.rehab, onset: startDay, cautions: "" }, schedule: { kind: "per_day", count: 1 }, start: { day: on, time: null } }];
      return [{ ...newProcedureDraft("PROC-GUIDE", id), sourceText: src, comment: tag, guide: it.guide, schedule: { kind: "once" }, start: { day: on, time: null } }];
    }),
  );
}

/** Item keys from the given path day on (what is still ahead when the path is applied). */
export const keysFrom = (path: Pathway, fromDay: number) => path.days.filter((d) => d.day >= fromDay).flatMap((d) => d.orders.map((_, i) => itemKey(d.day, i)));

/** The confirmed orders of each path day (found by the comment the path put on them). */
export function confirmedOn(path: Pathway, entries: OrderEntry[], day: number): OrderEntry[] {
  const tag = pathTag(path, day);
  return entries.filter((e) => e.status !== "中止" && "comment" in e.order && typeof e.order.comment === "string" && e.order.comment.includes(tag));
}

/** Whether one item of a path day has been confirmed as an order (same kind and content, with the path's comment). */
export function itemConfirmed(path: Pathway, entries: OrderEntry[], day: number, it: PathOrder): boolean {
  return confirmedOn(path, entries, day).some((e) => {
    const o = e.order;
    if (it.kind === "lab") return o.type === "lab" && it.codes.every((c) => o.codes.includes(c));
    if (it.kind === "imaging") return o.type === "imaging" && o.region === it.region;
    if (it.kind === "physio") return o.type === "physio" && o.test === it.test;
    if (it.kind === "rehab") return o.type === "procedure" && o.code === "PROC-REHAB";
    return o.type === "procedure" && o.code === "PROC-GUIDE" && o.guide?.kind === it.guide.kind;
  });
}

export const evalOf =(book: PathBook, appId: string, key: string) => book.evals.filter((e) => e.appId === appId && e.key === key).at(-1);

/** Outcomes due by `upTo` (path day) and not evaluated yet, for the given role (or both). */
export function dueOutcomes(book: PathBook, app: PathApplication, upTo: number, who?: PathWho): { day: number; outcome: PathOutcome }[] {
  const path = findPath(app.code);
  if (!path || app.end) return [];
  return path.days.flatMap((d) => (d.day > upTo ? [] : d.outcomes.filter((x) => (!who || x.who === who) && !evalOf(book, app.id, x.key)).map((outcome) => ({ day: d.day, outcome }))));
}

/** Counts of the variances by category (for the list), largest first. */
export function varianceCounts(vs: Variance[]): { category: VarianceCategory; n: number }[] {
  return VARIANCE_CATEGORIES.map((category) => ({ category, n: vs.filter((v) => v.category === category).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
}

/** The line written into the chart for an evaluation (and its variance). */
export function evalLine(path: Pathway, day: number, outcome: PathOutcome, result: OutcomeEval["result"], v?: Pick<Variance, "category" | "detail">): string {
  return `・パス（${path.name} ${day}日目）アウトカム「${outcome.text}」：${result}${v ? `（バリアンス：${v.category}「${v.detail}」）` : ""}`;
}

/** Why an evaluation cannot be recorded by this role, or null. */
export const evalDeny = (outcome: PathOutcome, role: string) => (role === outcome.who ? null : `このアウトカムは${outcome.who}が評価します。`);
