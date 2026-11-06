import type { Coordination, LifeSupport, SupportConference } from "./life-support";
// 入院時の評価セット（令和8年度）. What must be done after admission, by whom and by when, is worked
// out by code from the admission day. People fill in the forms; nothing here is decided by AI.
// Deadlines count the admission day as day 1 (the strict side: the notice says 「入院後３日以内」
// without saying where to start counting, except the 入院診療計画, 「入院した日から起算して七日以内」).

import type { DayOffset } from "./types";
import type { Role } from "./roles";

export const R8 = {
  plan: "告示第70号 第四 一(3)・保医発0305第7号 別添2 第1の1（入院した日から起算して7日以内に文書で説明。令和8年度から署名は不要、説明日と説明者を記録）",
  nutrition: "保医発0305第7号 別添2 第1の5(3)(4)（特別な栄養管理の必要性を入院診療計画書に書く。必要なら栄養管理計画書を入院日に。救急や休日の入院は入院後7日以内）",
  reassess: "保医発0305第7号 別添2 第1の5(5)(7)（栄養管理計画書に栄養状態の評価の間隔を書き、計画に基づいて定期的に評価し、必要なら計画を見直す）。期限は計画書で決めた再評価の日",
  pressure: "保医発0305第7号 別添2 第1の4(3)・別添6 別紙3（日常生活の自立度が低い患者の危険因子の評価。「できない」「あり」が1つ以上なら計画）",
  delirium: "保医発0305第6号 別添1 A247-2(4)・別紙様式7の3（リスク因子の確認は入院前か入院後3日以内、対策は確認後速やかに）",
  discharge: "保医発0305第6号 別添1 A246(2)(3)(5)（入退院支援加算１：退院困難な要因の抽出は入院後3日以内、話合い・計画の着手・カンファレンスは7日以内）",
  fall: "診療報酬の要件ではない。項目は日本医療安全調査機構「医療事故の再発防止に向けた提言 第9号」（2019）の転倒・転落リスクから。期限は院内の取り決め",
};

/** 障害高齢者の日常生活自立度（寝たきり度）, 別添6 別紙13. */
export const ADL_RANKS = ["J1", "J2", "A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type AdlRank = (typeof ADL_RANKS)[number];

/**
 * Which ranks count as 「日常生活の自立度が低い」. The R8 notice does not say (older forms said J1〜A2
 * need no assessment), so this is a setting of the fictional hospital.
 */
export const PRESSURE_TARGET_RANKS: AdlRank[] = ["B1", "B2", "C1", "C2"];

/** 褥瘡に関する危険因子（別紙3）. */
export const PRESSURE_ITEMS = [
  { key: "turn", label: "基本的動作能力：ベッド上 自力体位変換", yes: "できない", no: "できる" },
  { key: "sit", label: "基本的動作能力：イス上 坐位姿勢の保持、除圧", yes: "できない", no: "できる" },
  { key: "bone", label: "病的骨突出", yes: "あり", no: "なし" },
  { key: "contracture", label: "関節拘縮", yes: "あり", no: "なし" },
  { key: "nutrition", label: "栄養状態低下", yes: "あり", no: "なし" },
  { key: "moist", label: "皮膚湿潤（多汗、尿失禁、便失禁）", yes: "あり", no: "なし" },
  { key: "edema", label: "皮膚の脆弱性（浮腫）", yes: "あり", no: "なし" },
  { key: "skintear", label: "皮膚の脆弱性（スキン-テアの保有、既往）", yes: "あり", no: "なし" },
] as const;

/** せん妄のリスク因子と対策（別紙様式7の3）. */
export const DELIRIUM_RISKS = ["70歳以上", "脳器質的障害", "認知症", "アルコール多飲", "せん妄の既往", "リスクとなる薬剤（特にベンゾジアゼピン系薬剤）の使用", "全身麻酔を要する手術後又はその予定があること"] as const;
export const DELIRIUM_MEASURES = [
  "認知機能低下に対する介入（見当識の維持等）",
  "脱水の治療・予防（適切な補液と水分摂取）",
  "リスクとなる薬剤（特にベンゾジアゼピン系薬剤）の漸減・中止",
  "早期離床の取組",
  "疼痛管理の強化（痛みの客観的評価の併用等）",
  "適切な睡眠管理（非薬物的な入眠の促進等）",
  "本人及び家族へのせん妄に関する情報提供",
] as const;

/** 転倒・転落リスク（提言第9号 表1・提言2）. No score: there is no public original to score with. */
export const FALL_RISKS = ["転倒・転落歴", "転倒・転落につながるヒヤリ・ハット", "認知機能低下・せん妄など", "介助が必要なときにナースコールで知らせずに行動する", "歩行時に介助が必要", "向精神薬の使用", "頻尿や夜間の排泄行動", "抗凝固薬・抗血小板薬の内服"] as const;

/** 退院困難な要因（A246(2) ア〜チ、令和8年度）. */
export const DISCHARGE_FACTORS = [
  { key: "ア", label: "悪性腫瘍、認知症又は誤嚥性肺炎等の急性呼吸器感染症" },
  { key: "イ", label: "緊急入院" },
  { key: "ウ", label: "要介護・要支援の疑いがあるが認定が未申請（区分の変更の未申請を含む）" },
  { key: "エ", label: "コミュニケーションに特別な技術が必要な障害" },
  { key: "オ", label: "強度行動障害の状態" },
  { key: "カ", label: "家族又は同居者からの虐待（疑いを含む）" },
  { key: "キ", label: "生活困窮者" },
  { key: "ク", label: "入院前に比べ ADL が低下し、退院後の生活様式の再編が必要" },
  { key: "ケ", label: "排泄に介助を要する" },
  { key: "コ", label: "必要な養育又は介護を十分に提供できる状況にない" },
  { key: "サ", label: "退院後に医療処置（経管栄養法を含む）が必要" },
  { key: "シ", label: "入退院を繰り返している" },
  { key: "ス", label: "入院治療を行っても長期的な低栄養状態が見込まれる" },
  { key: "セ", label: "家族の介助や介護を日常的に行っている児童等" },
  { key: "ソ", label: "児童等の家族から介助や介護を日常的に受けている" },
  { key: "タ", label: "意思決定支援や退院後の調整で家族・親族との連絡が困難（令和8年度新設）" },
  { key: "チ", label: "その他ア〜タに準ずる" },
] as const;

/** When, and (for steps done in this app) who. */
type At = { day: DayOffset; time: string; by?: string };

export interface PlanRecord {
  /** 推定される入院期間（日）. */
  days: number;
  symptoms: string;
  treatment: string;
  tests: string;
  surgery: string;
  other: string;
  /** 特別な栄養管理の必要性. */
  nutritionNeeded: "有" | "無";
  explainedTo: string;
  explainedBy: string;
  explainedAt: At;
}

export interface NutritionRecord {
  glim?: string;
  assessment?: string;
  sga?: string;
  food?: string;
  goal: string;
  energyKcal: number;
  proteinG: number;
  route: "経口" | "経腸栄養" | "静脈栄養";
  counseling: string;
  /** 栄養状態の再評価の予定日（offset）. */
  reassessOn: DayOffset;
  by: string;
  at: At;
  /** Why this version was made: a reassessment, or a correction (none for the first version). */
  revision?: { kind: "再評価" | "訂正"; reason: string };
  /** The earlier versions, oldest first (the fields above are the version in force). */
  earlier?: NutritionVersion[];
}

export type NutritionVersion = Omit<NutritionRecord, "earlier">;
/** What a person writes in the plan (who and when are added by code). */
export type NutritionFields = Pick<NutritionRecord, "goal" | "energyKcal" | "proteinG" | "route" | "counseling" | "reassessOn">;

export interface PressureRecord {
  adl: AdlRank;
  /** Risk items answered (key → true when 「できない」「あり」). */
  items: Partial<Record<(typeof PRESSURE_ITEMS)[number]["key"], boolean>>;
  ulcerNow: boolean;
  plan: string;
  by: string;
  at: At;
}

export interface ChecklistRecord {
  checked: string[];
  /** Measures (せん妄) or what will be done (転倒転落). */
  measures: string[];
  plan?: string;
  by: string;
  at: At;
}

export interface DischargeSupport {
  reassessments?: { date: string; factors: string[]; note: string; by: string }[];
  conferences?: SupportConference[];
  factors: string[];
  note: string;
  extractedBy: string;
  extractedAt: At;
  talkedAt?: At;
  planStartedAt?: At;
  conferenceAt?: At;
}

export interface AdmitEval {
  lifeSupport?: LifeSupport;
  coordination?: Coordination;
  patientId: string;
  /** 救急や休日の入院（栄養管理計画の期限が入院後7日以内になる）. */
  emergency?: boolean;
  plan?: PlanRecord;
  nutrition?: NutritionRecord;
  pressure?: PressureRecord;
  fall?: ChecklistRecord;
  delirium?: ChecklistRecord;
  discharge?: DischargeSupport;
}

export type ItemKey = "plan" | "nutrition" | "reassess" | "pressure" | "fall" | "delirium" | "discharge" | "talk" | "conference";

export interface Due {
  key: ItemKey;
  label: string;
  who: Role[];
  /** Last day it may be done (offset from today). null = not needed. */
  dueOn: DayOffset | null;
  doneOn?: DayOffset;
  state: "済" | "期限内" | "今日まで" | "期限切れ" | "不要";
  note?: string;
  source: string;
}

/** Day N of the stay (day 1 = the admission day) as an offset from today. */
export const dayOfStay = (admittedOn: DayOffset, n: number) => admittedOn + n - 1;

/** True when the pressure-ulcer risk items must be filled for this rank. */
export const pressureTarget = (adl: AdlRank) => PRESSURE_TARGET_RANKS.includes(adl);

/** A care plan is needed: any 「できない」「あり」, or a pressure ulcer now. */
export const pressurePlanNeeded = (r: PressureRecord) => r.ulcerNow || (pressureTarget(r.adl) && Object.values(r.items).some(Boolean));

const relDay = (d: DayOffset) => (d === 0 ? "今日" : d === -1 ? "昨日" : d === 1 ? "明日" : d < 0 ? `${-d}日前` : `${d}日後`);

// ---------- 栄養管理計画書の版 ----------
// A saved plan is never overwritten: a reassessment (再評価) or a correction (訂正) adds a version, and
// every earlier version stays with who wrote it and when (as the notes do, see notes.ts).

/** Every version of the plan, oldest first; the last one is in force. */
export function nutritionVersions(r: NutritionRecord): NutritionVersion[] {
  const { earlier = [], ...cur } = r;
  return [...earlier, cur];
}

/** A new version of the plan; the version in force becomes the latest earlier one. */
export function reviseNutrition(cur: NutritionRecord, next: NutritionFields, by: string, at: At, revision: { kind: "再評価" | "訂正"; reason: string }): NutritionRecord {
  const { earlier = [], ...prev } = cur;
  return { ...prev, ...next, by, at, revision: { kind: revision.kind, reason: revision.reason.trim() }, earlier: [...earlier, prev] };
}

/** Why a revision cannot be saved yet (empty when it can). A reassessment may keep the same plan; a correction must change something. */
export function revisionProblems(next: NutritionFields, revision: { kind: "再評価" | "訂正"; reason: string }, before?: NutritionFields): string[] {
  const out: string[] = [];
  if (!next.goal.trim() || !next.energyKcal || !next.proteinG) out.push("目標・エネルギー・たんぱく質を入れてください。");
  if (revision.kind === "再評価" && !(next.reassessOn > 0)) out.push("再評価したので、次の再評価の日（1日後より先）を決めてください。");
  if (revision.kind === "訂正" && !revision.reason.trim()) out.push("訂正の理由を書いてください。");
  if (revision.kind === "訂正" && before && nutritionChanges(before, next).length === 0) out.push("直したところがまだありません。");
  return out;
}

const NUTRITION_LABELS: { key: keyof NutritionFields; label: string; show: (v: NutritionFields[keyof NutritionFields]) => string }[] = [
  { key: "goal", label: "目標", show: (v) => String(v) || "（なし）" },
  { key: "energyKcal", label: "エネルギー", show: (v) => `${v}kcal` },
  { key: "proteinG", label: "たんぱく質", show: (v) => `${v}g` },
  { key: "route", label: "栄養補給方法", show: (v) => String(v) },
  { key: "counseling", label: "栄養食事相談", show: (v) => String(v) || "（なし）" },
  { key: "reassessOn", label: "再評価の日", show: (v) => relDay(Number(v)) },
];

/** What changed from one version to the next, in words (「エネルギー：1600kcal → 1400kcal」). */
export function nutritionChanges(before: NutritionFields, after: NutritionFields, showDay: (d: DayOffset) => string = relDay): string[] {
  return NUTRITION_LABELS.filter((f) => before[f.key] !== after[f.key]).map((f) => {
    const show = f.key === "reassessOn" ? (v: NutritionFields[keyof NutritionFields]) => showDay(Number(v)) : f.show;
    return `${f.label}：${show(before[f.key])} → ${show(after[f.key])}`;
  });
}

function state(dueOn: DayOffset | null, doneOn: DayOffset | undefined): Due["state"] {
  if (dueOn === null) return "不要";
  if (doneOn !== undefined) return "済";
  if (dueOn < 0) return "期限切れ";
  return dueOn === 0 ? "今日まで" : "期限内";
}

/** Every item with its deadline and state, for one patient. */
export function duesOf(a: AdmitEval, admittedOn: DayOffset): Due[] {
  const d = (n: number) => dayOfStay(admittedOn, n);
  const out: Due[] = [];
  const add = (x: Omit<Due, "state">) => out.push({ ...x, state: state(x.dueOn, x.doneOn) });
  add({ key: "plan", label: "入院診療計画書", who: ["医師"], dueOn: d(7), doneOn: a.plan?.explainedAt.day, source: R8.plan });
  const nNeeded = a.plan?.nutritionNeeded;
  add({
    key: "nutrition",
    label: "栄養管理計画書",
    who: ["管理栄養士"],
    dueOn: nNeeded === "無" ? null : a.emergency ? d(7) : d(1),
    // The plan was made on the day of its first version (later versions are reassessments or corrections).
    doneOn: a.nutrition ? nutritionVersions(a.nutrition)[0].at.day : undefined,
    note: nNeeded === undefined ? "必要かどうかは入院診療計画書で決めます" : nNeeded === "有" ? `特別な栄養管理が必要（${a.emergency ? "救急・休日の入院なので7日以内" : "入院日に作る"}）` : undefined,
    source: R8.nutrition,
  });
  const n = a.nutrition;
  const lastReassess = n ? nutritionVersions(n).filter((v) => v.revision?.kind === "再評価").at(-1) : undefined;
  add({
    key: "reassess",
    label: "栄養の再評価",
    who: ["管理栄養士"],
    dueOn: n ? n.reassessOn : null,
    note: !n
      ? nNeeded === "無"
        ? undefined
        : "栄養管理計画書を作ると、計画書で決めた再評価の日がここに出ます"
      : lastReassess
        ? `前回の再評価：${relDay(lastReassess.at.day)} ${lastReassess.at.time} ${lastReassess.by}`
        : `計画書（${relDay(n.at.day)} ${n.by}）で決めた日。再評価したら計画書の「再評価した」で次の日を決めます`,
    source: R8.reassess,
  });
  const pr = a.pressure;
  add({
    key: "pressure",
    label: "褥瘡の危険因子の評価",
    who: ["看護師"],
    dueOn: d(2),
    doneOn: pr ? (pressurePlanNeeded(pr) && !pr.plan.trim() ? undefined : pr.at.day) : undefined,
    note: pr && pressurePlanNeeded(pr) && !pr.plan.trim() ? "危険因子があるので看護計画が要ります" : pr && !pressureTarget(pr.adl) && !pr.ulcerNow ? `自立度 ${pr.adl}（評価の対象外）` : "期限は入院後2日以内。通知に期限の定めはありません",
    source: R8.pressure,
  });
  add({ key: "fall", label: "転倒・転落の評価", who: ["看護師"], dueOn: d(1), doneOn: a.fall?.at.day, note: "院内様式（入院日）", source: R8.fall });
  const dl = a.delirium;
  add({
    key: "delirium",
    label: "せん妄のリスク因子の確認",
    who: ["看護師", "医師"],
    dueOn: d(3),
    doneOn: dl ? (dl.checked.length > 0 && dl.measures.length === 0 ? undefined : dl.at.day) : undefined,
    note: dl && dl.checked.length > 0 && dl.measures.length === 0 ? "リスク因子があるので対策を選んでください" : dl && dl.checked.length > 0 ? "せん妄ハイリスク患者ケア加算（100点、入院中1回）の対象" : undefined,
    source: R8.delirium,
  });
  const ds = a.discharge;
  add({ key: "discharge", label: "退院困難な要因の抽出", who: ["MSW", "看護師"], dueOn: d(3), doneOn: ds?.extractedAt.day, source: R8.discharge });
  const target = !!ds && ds.factors.length > 0;
  add({ key: "talk", label: "患者・家族との話合いと計画の着手", who: ["MSW", "看護師"], dueOn: ds && !target ? null : d(7), doneOn: ds?.talkedAt && ds.planStartedAt ? Math.max(ds.talkedAt.day, ds.planStartedAt.day) : undefined, source: R8.discharge });
  add({ key: "conference", label: "退院支援のカンファレンス", who: ["MSW", "看護師"], dueOn: ds && !target ? null : d(7), doneOn: ds?.conferenceAt?.day, source: R8.discharge });
  return out;
}

/** 退院支援 done within the deadlines of 入退院支援加算１ (the claim is made at discharge). */
export function dischargeSupportMet(a: AdmitEval, admittedOn: DayOffset): boolean {
  const ds = a.discharge;
  if (!ds || ds.factors.length === 0 || !ds.talkedAt || !ds.planStartedAt || !ds.conferenceAt) return false;
  const d = (n: number) => dayOfStay(admittedOn, n);
  return ds.extractedAt.day <= d(3) && ds.talkedAt.day <= d(7) && ds.planStartedAt.day <= d(7) && ds.conferenceAt.day <= d(7);
}

/** The delirium add-on applies: risk checked in time and measures done. */
export const deliriumBillable = (a: AdmitEval, admittedOn: DayOffset) => !!a.delirium && a.delirium.checked.length > 0 && a.delirium.measures.length > 0 && a.delirium.at.day <= dayOfStay(admittedOn, 3);

/** What code can suggest (a person confirms): 70歳以上 from the age, ア/イ from the diagnosis and the arrival. */
export function suggestions(p: { age: number; admissionDiagnosis: string }, emergency: boolean) {
  return {
    delirium: p.age >= 70 ? ["70歳以上"] : [],
    discharge: [...(/悪性腫瘍|がん|癌|認知症|誤嚥性肺炎|肺炎/.test(p.admissionDiagnosis) ? ["ア"] : []), ...(emergency ? ["イ"] : [])],
  };
}

const at = (day: DayOffset, time: string): At => ({ day, time });

/** The fictional record before this session: older patients have most items done; some are still open. */
export function initialEvals(): AdmitEval[] {
  return [
    {
      patientId: "90010231", // 佐倉（入院4日目）
      emergency: false,
      plan: { days: 14, symptoms: "右下腿の発赤・腫脹・疼痛、発熱", treatment: "抗菌薬の点滴、患肢の挙上・安静", tests: "血液検査（週2回）、血液培養", surgery: "なし", other: "看護計画：疼痛の観察、皮膚の観察", nutritionNeeded: "無", explainedTo: "本人", explainedBy: "山本（専攻医）", explainedAt: at(-3, "16:10") },
      pressure: { adl: "A1", items: {}, ulcerNow: false, plan: "", by: "看護師 佐々木", at: at(-3, "17:00") },
      fall: { checked: ["歩行時に介助が必要"], measures: [], plan: "ナースコールを手元に。トイレ歩行は付き添う", by: "看護師 佐々木", at: at(-3, "17:00") },
      delirium: { checked: ["70歳以上"], measures: ["早期離床の取組", "適切な睡眠管理（非薬物的な入眠の促進等）"], by: "看護師 佐々木", at: at(-2, "10:00") },
      discharge: { factors: ["ク"], note: "独居。歩行が不安定", extractedBy: "MSW 伊藤", extractedAt: at(-2, "14:00"), planStartedAt: at(-1, "15:00") },
    },
    {
      patientId: "90010244", // 大浦（入院2日目）
      emergency: true,
      plan: { days: 21, symptoms: "発熱、湿性咳嗽、SpO2 低下", treatment: "抗菌薬の点滴、酸素、絶食と補液、嚥下評価のあと食事を再開", tests: "血液検査、胸部X線、嚥下評価", surgery: "なし", other: "看護計画：呼吸状態の観察、口腔ケア", nutritionNeeded: "有", explainedTo: "長女", explainedBy: "山本（専攻医）", explainedAt: at(-1, "18:30") },
    },
    {
      patientId: "90010198", // 北村（入院6日目）
      emergency: false,
      plan: { days: 14, symptoms: "労作時の息切れ、下腿浮腫", treatment: "利尿薬、塩分制限食", tests: "血液検査、胸部X線、心エコー", surgery: "なし", other: "看護計画：体重・尿量の観察", nutritionNeeded: "有", explainedTo: "本人・妻", explainedBy: "山本（専攻医）", explainedAt: at(-5, "17:20") },
      nutrition: { goal: "体重を目標まで戻し、塩分6g未満を続ける", energyKcal: 1600, proteinG: 60, route: "経口", counseling: "退院時に本人と妻へ減塩の栄養食事指導", reassessOn: 0, by: "管理栄養士 高橋", at: at(-5, "17:50") },
      pressure: { adl: "A2", items: {}, ulcerNow: false, plan: "", by: "看護師 佐々木", at: at(-5, "18:00") },
      fall: { checked: ["頻尿や夜間の排泄行動"], measures: [], plan: "夜間はポータブルトイレ。足元灯", by: "看護師 佐々木", at: at(-5, "18:00") },
      delirium: { checked: ["70歳以上"], measures: ["適切な睡眠管理（非薬物的な入眠の促進等）", "本人及び家族へのせん妄に関する情報提供"], by: "看護師 佐々木", at: at(-4, "10:00") },
      discharge: { factors: ["シ"], note: "1年で3回目の入院", extractedBy: "MSW 伊藤", extractedAt: at(-4, "11:00"), talkedAt: at(-3, "14:00"), planStartedAt: at(-3, "14:30"), conferenceAt: at(-2, "15:00") },
    },
    {
      patientId: "90010260", // 森（入院3日目）
      emergency: true,
      pressure: { adl: "J2", items: {}, ulcerNow: false, plan: "", by: "看護師 佐々木", at: at(-2, "22:00") },
      fall: { checked: [], measures: [], plan: "", by: "看護師 佐々木", at: at(-2, "22:00") },
    },
  ];
}
