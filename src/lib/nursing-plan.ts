// 看護計画: for each patient, the nursing problems numbered #1, #2 … with the goal (目標), what to do
// (観察・ケア・指導 = OP・TP・EP), the day it was planned (立案日), the day to evaluate it (評価予定日) and
// each evaluation (継続・修正・解決). The notice asks the record to hold 看護の目標、具体的な看護の方法
// 及び評価等; how the plan is written is up to each hospital. The code counts the days and says what is due;
// nurses write and decide. Problems are written in plain words (no diagnosis label system is used).
// Data is fictional.

import type { CareOrder } from "./care-orders";
import type { DayOffset } from "./types";

export const PLAN_SOURCES = {
  record: {
    label: "厚生労働省保険局医療課長通知「基本診療料の施設基準等及びその届出に関する手続きの取扱いについて」（令和8年3月5日 保医発0305第7号）別添6 別紙6「入院基本料に係る看護記録」1(2) 看護計画に関する記録（個々の患者について、計画的に適切な看護を行うため、看護の目標、具体的な看護の方法及び評価等を記録する）",
    url: "https://kouseikyoku.mhlw.go.jp/kantoshinetsu/kihon080305.pdf",
  },
  ward: {
    label: "同 通知 別添2 第2 4 (6) ウ（患者ごとに看護計画が立てられ、その計画に沿って看護が実施されるよう配慮する）",
    url: "https://kouseikyoku.mhlw.go.jp/kantoshinetsu/kihon080305.pdf",
  },
};

/** 具体策 of a problem: 観察 (OP), ケア (TP), 指導 (EP). */
export type PlanList = "OP" | "TP" | "EP";
export const PLAN_LISTS: { key: PlanList; label: string; long: string }[] = [
  { key: "OP", label: "観察", long: "観察計画（OP：Observation Plan）" },
  { key: "TP", label: "ケア", long: "ケア計画（TP：Treatment Plan）" },
  { key: "EP", label: "指導", long: "指導計画（EP：Education Plan）" },
];
export const listLabel = (l: PlanList) => PLAN_LISTS.find((x) => x.key === l)!.label;

export const EVAL_RESULTS = ["継続", "修正", "解決"] as const;
export type EvalResult = (typeof EVAL_RESULTS)[number];

/** The first and next 評価予定日: this many days after the plan or the last evaluation (架空の病院の取り決め). */
export const EVAL_INTERVAL_DAYS = 7;
export const defaultEvalDue = (from: DayOffset) => from + EVAL_INTERVAL_DAYS;

export interface PlanBody {
  /** 看護問題, in plain words. */
  problem: string;
  /** 目標. */
  goal: string;
  op: string[];
  tp: string[];
  ep: string[];
}

export interface PlanEvaluation {
  day: DayOffset;
  time: string;
  by: string;
  result: EvalResult;
  note: string;
  /** The next 評価予定日 set at this evaluation (継続・修正). */
  nextDue?: DayOffset;
  /** For 修正: the plan as it was before. */
  before?: PlanBody;
}

export interface NursingProblem extends PlanBody {
  id: string;
  patientId: string;
  /** #n, per patient; a number is never used again. */
  no: number;
  plannedOn: DayOffset;
  plannedAt: string;
  by: string;
  evalDue: DayOffset;
  evaluations: PlanEvaluation[];
  closed?: { day: DayOffset; time: string; by: string };
}

export const problemsOf = (all: NursingProblem[], patientId: string) => all.filter((p) => p.patientId === patientId).sort((a, b) => a.no - b.no);
export const openProblems = (all: NursingProblem[], patientId: string) => problemsOf(all, patientId).filter((p) => !p.closed);

export const nextNo = (all: NursingProblem[], patientId: string) => Math.max(0, ...all.filter((p) => p.patientId === patientId).map((p) => p.no)) + 1;

const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
export const cleanBody = (b: PlanBody): PlanBody => ({ problem: b.problem.trim(), goal: b.goal.trim(), op: clean(b.op), tp: clean(b.tp), ep: clean(b.ep) });

/** What is missing before a problem can be planned. */
export function bodyProblems(b: PlanBody): string[] {
  const c = cleanBody(b);
  const out: string[] = [];
  if (!c.problem) out.push("看護問題");
  if (!c.goal) out.push("目標");
  if (!c.op.length && !c.tp.length && !c.ep.length) out.push("具体策（観察・ケア・指導のどれか1つ以上）");
  return out;
}

export function planProblems(b: PlanBody, evalDue: DayOffset, today: DayOffset): string[] {
  const out = bodyProblems(b);
  if (!Number.isInteger(evalDue) || evalDue <= today) out.push("評価予定日（明日以降）");
  return out;
}

export function addProblem(all: NursingProblem[], patientId: string, body: PlanBody, evalDue: DayOffset, id: string, by: string, now: { day: DayOffset; time: string }): NursingProblem[] {
  return [...all, { id, patientId, no: nextNo(all, patientId), ...cleanBody(body), plannedOn: now.day, plannedAt: now.time, by, evalDue, evaluations: [] }];
}

export interface EvalInput {
  result: EvalResult;
  note: string;
  /** 継続・修正: the next 評価予定日. */
  nextDue?: DayOffset;
  /** 修正: the plan as changed. */
  revised?: PlanBody;
}

const sameBody = (a: PlanBody, b: PlanBody) => JSON.stringify(cleanBody(a)) === JSON.stringify(cleanBody(b));

/** What is missing before an evaluation can be recorded. */
export function evalProblems(p: PlanBody, e: EvalInput, today: DayOffset): string[] {
  const out: string[] = [];
  if (!e.note.trim()) out.push("評価の内容（目標に対してどうか）");
  if (e.result !== "解決" && (e.nextDue === undefined || e.nextDue <= today)) out.push("次の評価予定日（明日以降）");
  if (e.result === "修正") {
    if (!e.revised) out.push("修正した計画");
    else {
      out.push(...bodyProblems(e.revised));
      if (sameBody(p, e.revised)) out.push("計画が変わっていません（変えないときは「継続」）");
    }
  }
  return out;
}

/** 評価: 継続 sets the next day, 修正 also changes the plan (the old one is kept), 解決 closes the problem. */
export function evaluateProblem(all: NursingProblem[], id: string, e: EvalInput, by: string, now: { day: DayOffset; time: string }): NursingProblem[] {
  return all.map((p) => {
    if (p.id !== id || p.closed) return p;
    const before: PlanBody = { problem: p.problem, goal: p.goal, op: p.op, tp: p.tp, ep: p.ep };
    const ev: PlanEvaluation = { day: now.day, time: now.time, by, result: e.result, note: e.note.trim(), ...(e.result !== "解決" ? { nextDue: e.nextDue } : {}), ...(e.result === "修正" ? { before } : {}) };
    const next = { ...p, evaluations: [...p.evaluations, ev] };
    if (e.result === "解決") return { ...next, closed: { ...now, by } };
    return { ...next, ...(e.result === "修正" && e.revised ? cleanBody(e.revised) : {}), evalDue: e.nextDue ?? defaultEvalDue(now.day) };
  });
}

/** Whether the evaluation is due: today, past (late), or how many days are left. */
export function evalStatus(p: NursingProblem, today: DayOffset = 0): { due: boolean; late: boolean; text: string } | null {
  if (p.closed) return null;
  const d = p.evalDue - today;
  return { due: d <= 0, late: d < 0, text: d < 0 ? `評価予定日を${-d}日過ぎています` : d === 0 ? "評価予定日は今日です" : `評価予定日まであと${d}日` };
}

/** Problems whose evaluation is due today or late, for the nurse's to-dos (oldest first). */
export function dueEvaluations(all: NursingProblem[], patientIds: string[], today: DayOffset = 0): NursingProblem[] {
  return all.filter((p) => patientIds.includes(p.patientId) && evalStatus(p, today)?.due).sort((a, b) => a.evalDue - b.evalDue || a.no - b.no);
}

export const problemTitle = (p: Pick<NursingProblem, "no" | "problem">) => `#${p.no} ${p.problem}`;

/** Lines for the 看護サマリ: each open problem with its goal, and the care orders in force. */
export function summaryLines(all: NursingProblem[], patientId: string, fmtDay: (d: DayOffset) => string): string[] {
  return openProblems(all, patientId).map((p) => `${problemTitle(p)}（目標：${p.goal}。評価予定日 ${fmtDay(p.evalDue)}）`);
}

/** Care orders that carry out this problem, by list. */
export const ordersOf = (orders: CareOrder[], problemId: string, list: PlanList) => orders.filter((o) => o.plan?.problemId === problemId && o.plan.list === list);

// ---------------------------------------------------------------------------
// Templates (架空の病院の標準計画の例). A nurse picks one only to save typing, then writes it for the patient.
// ---------------------------------------------------------------------------

export const PLAN_TEMPLATES: { name: string; body: PlanBody }[] = [
  {
    name: "飲み込み・誤嚥",
    body: {
      problem: "食べ物や唾液が気管に入り、肺炎をくり返すおそれがある",
      goal: "入院中に、誤嚥による発熱や息苦しさが増えない",
      op: ["むせ・咳の有無（食事中・食後）", "呼吸の回数・SpO2・痰の量と色", "口の中の乾燥・汚れ", "熱"],
      tp: ["口腔ケア", "食事のときは体を起こし、食後もしばらく起こしておく", "体位変換", "痰がからむときは吸引"],
      ep: ["本人と家族に、ひと口を少なく、ゆっくり食べることを伝える"],
    },
  },
  {
    name: "床ずれ（褥瘡）",
    body: {
      problem: "自分で寝返りができず、皮膚が長く押されて床ずれができるおそれがある",
      goal: "入院中に、新しい床ずれができない",
      op: ["骨の出ているところの皮膚の赤み", "皮膚の湿り（汗・尿・便）", "食事の量"],
      tp: ["体位変換", "体圧を分散するマットレスを使う", "汚れたらすぐに皮膚を清潔にする"],
      ep: ["家族に、体の向きを変えることの大切さを伝える"],
    },
  },
  {
    name: "転倒・転落",
    body: {
      problem: "ひとりで動こうとして、転んだりベッドから落ちたりするおそれがある",
      goal: "入院中に転倒・転落しない",
      op: ["トイレに行く回数と時間", "ふらつき・歩き方", "眠気の出る薬の使用"],
      tp: ["ナースコールを手の届くところに置く", "ベッドを低くし、履きなれた靴を使う", "トイレの時間に合わせて声をかける"],
      ep: ["動くときはナースコールで呼ぶことを、本人にくり返し伝える"],
    },
  },
  {
    name: "夜の混乱",
    body: {
      problem: "夜に混乱し、点滴や管を自分で抜いてしまうおそれがある",
      goal: "点滴や管を抜かずに治療を続けられる",
      op: ["夜の眠り・落ち着き", "点滴や管に手を伸ばす動き", "痛み・便秘・尿のたまり"],
      tp: ["点滴の管を見えにくい位置に通す", "時計とカレンダーを見えるところに置く", "訪室をふやす"],
      ep: ["家族に、なじみのある物を持ってきてもらうよう伝える"],
    },
  },
  {
    name: "退院後の暮らし",
    body: {
      problem: "退院後の食事や薬の管理に不安がある",
      goal: "退院までに、本人か家族が食事と薬の管理のしかたを言える",
      op: ["本人・家族の話す不安", "薬を自分で飲めているか"],
      tp: ["退院支援の担当者と話し合いの場をもつ"],
      ep: ["薬の飲み方と、受診が必要な症状を説明する", "食事で気をつけることを説明する"],
    },
  },
];

// ---------------------------------------------------------------------------
// Fictional plans for the fictional patients
// ---------------------------------------------------------------------------

export const INITIAL_PLANS: NursingProblem[] = [
  {
    id: "np-244-1",
    patientId: "90010244",
    no: 1,
    problem: "食べ物や唾液が気管に入り、肺炎をくり返すおそれがある",
    goal: "入院中に、誤嚥による発熱や息苦しさが増えない",
    op: ["むせ・咳の有無", "呼吸の回数・SpO2・痰の量と色", "口の中の乾燥・汚れ", "熱"],
    tp: ["口腔ケア（絶食中も1日4回）", "体位変換（2時間ごと）", "痰がからむときは吸引"],
    ep: ["食事が始まったら、家族にひと口を少なくゆっくり食べることを伝える"],
    plannedOn: -1,
    plannedAt: "15:00",
    by: "看護師 渡辺",
    // 入院翌日に一度評価する（立案した看護師が既定の7日を変えた）.
    evalDue: 0,
    evaluations: [],
  },
  {
    id: "np-244-2",
    patientId: "90010244",
    no: 2,
    problem: "夜に混乱し、点滴や酸素の管を自分で外してしまうおそれがある",
    goal: "点滴と酸素を外さずに治療を続けられる",
    op: ["夜の眠り・落ち着き", "点滴や管に手を伸ばす動き", "痛み・尿のたまり"],
    tp: ["点滴の管を袖の中に通す", "時計と照明で昼と夜が分かるようにする", "訪室をふやす"],
    ep: ["長女に、なじみのある物を持ってきてもらうよう伝える"],
    plannedOn: -1,
    plannedAt: "22:40",
    by: "看護師 渡辺",
    evalDue: 1,
    evaluations: [],
  },
  {
    id: "np-231-1",
    patientId: "90010231",
    no: 1,
    problem: "右足の腫れと痛みで、歩くことや体を清潔に保つことが難しい",
    goal: "痛みが和らぎ、介助を受けて体を清潔に保てる",
    op: ["右下腿の赤みの範囲（印の線と比べる）・熱感・痛み", "熱"],
    tp: ["右足を高くする", "清拭（隔日）"],
    ep: ["足の傷を清潔に保つ方法を説明する"],
    plannedOn: -3,
    plannedAt: "17:00",
    by: "看護師 田中",
    evalDue: 4,
    evaluations: [],
  },
  {
    id: "np-198-1",
    patientId: "90010198",
    no: 1,
    problem: "心臓の負担がふえ、息苦しさやむくみが強くなるおそれがある",
    goal: "息苦しさなく病棟内を歩け、体重が入院前の体重に近づく",
    op: ["体重（毎朝）・尿の量", "むくみ", "夜間の息苦しさ・呼吸の回数・SpO2"],
    tp: ["水分の量を指示のとおりに保つ", "体を起こした姿勢で休めるようにする"],
    ep: ["退院後も毎朝体重を測り、ふえたら受診することを説明する"],
    plannedOn: -5,
    plannedAt: "16:00",
    by: "看護師 佐藤",
    evalDue: 5,
    evaluations: [{ day: -2, time: "15:00", by: "看護師 佐藤", result: "継続", note: "体重は3日で3kg減った。むくみは軽くなったが残る。夜間の息苦しさはない", nextDue: 5 }],
  },
];
