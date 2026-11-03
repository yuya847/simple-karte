// 身体的拘束の記録: restraint only when it cannot be avoided, with what the rules ask to be recorded —
// how (用具) and for how long, the patient's state, why it was unavoidable, and the three conditions
// (切迫性・非代替性・一時性) — then a review each shift until it ends. The code counts the time and
// says when a review is due; people decide. Data is fictional.

export const RESTRAINT_SOURCES = {
  rule: {
    label: "厚生労働省 令和6年度診療報酬改定「身体的拘束を最小化する取組の強化（入院料通則の改定）」身体的拘束最小化の基準",
    url: "https://www.mhlw.go.jp/content/10808000/001270593.pdf",
  },
  guide: {
    label: "厚生労働省「介護施設・事業所等で働く方々への身体拘束廃止・防止の手引き」（2024年3月）3-1 緊急やむを得ない場合の三つの要件",
    url: "https://www.mhlw.go.jp/content/12300000/001248430.pdf",
  },
  qa: {
    label: "厚生労働省保険局医療課「疑義解釈資料の送付について（その17）」令和6年12月18日",
    url: "https://kouseikyoku.mhlw.go.jp/kinki/gyomu/bu_ka/kanri/documents/000375950.pdf",
  },
};

export const DEVICES = ["体幹ベルト", "上肢の抑制（片側）", "上肢の抑制（両側）", "下肢の抑制", "ミトン", "車いすのベルト", "ベッドを柵で囲む（4本柵）", "つなぎ服"] as const;

/** The three conditions; all must be met (paraphrased from the Ministry's guide). */
export const REQUIREMENTS = [
  { key: "切迫性", hint: "患者本人やほかの患者などの生命・身体が、危険にさらされる可能性がとても高い" },
  { key: "非代替性", hint: "身体的拘束のほかに、代わりになる方法がない" },
  { key: "一時性", hint: "身体的拘束が一時的なものである" },
] as const;
export type Requirement = (typeof REQUIREMENTS)[number]["key"];

/** Hours between reviews: each shift (架空の病院の取り決め). */
export const REVIEW_HOURS = 8;

export interface Moment {
  day: number;
  time: string;
}

export interface Restraint {
  id: string;
  patientId: string;
  devices: string[];
  /** 緊急やむを得ない理由. */
  why: string;
  /** その際の患者の心身の状況. */
  state: string;
  /** How each condition is met, in the staff's words. */
  met: Record<Requirement, string>;
  /** What was tried instead first. */
  tried: string;
  start: Moment;
  /** The doctor who decided, and who confirmed with them (not decided by one person). */
  doctor: string;
  confirmedBy: string;
  family: string;
  reviews: { at: Moment; by: string; decision: "続ける" | "やめる"; note: string }[];
  end?: { at: Moment; by: string; note: string };
}

export type RestraintDraft = Omit<Restraint, "id" | "patientId" | "start" | "reviews" | "end">;
export const emptyRestraint = (doctor: string): RestraintDraft => ({ devices: [], why: "", state: "", met: { 切迫性: "", 非代替性: "", 一時性: "" }, tried: "", doctor, confirmedBy: "", family: "" });

const abs = (m: Moment) => {
  const [h, mi] = m.time.split(":").map(Number);
  return m.day * 1440 + h * 60 + mi;
};

/** What is missing before a restraint can be recorded. */
export function startProblems(d: RestraintDraft): string[] {
  const out: string[] = [];
  if (!d.devices.length) out.push("用具");
  if (!d.why.trim()) out.push("緊急やむを得ない理由");
  if (!d.state.trim()) out.push("患者の心身の状況");
  for (const r of REQUIREMENTS) if (!d.met[r.key].trim()) out.push(r.key);
  if (!d.tried.trim()) out.push("試した代わりの方法");
  if (!d.doctor.trim()) out.push("指示した医師");
  if (!d.confirmedBy.trim()) out.push("一緒に確かめた人");
  return out;
}

/** Minutes restrained so far (to the end, or now). */
export function minutesOf(r: Restraint, nowAbs: number): number {
  return Math.max(0, (r.end ? abs(r.end.at) : nowAbs) - abs(r.start));
}

export const durationText = (min: number) => (min < 60 ? `${min}分` : `${Math.floor(min / 60)}時間${min % 60 ? `${min % 60}分` : ""}`);

/** When the next review is due (absolute minutes), and whether it is past. */
export function reviewDue(r: Restraint, nowAbs: number): { at: number; late: boolean; text: string } | null {
  if (r.end) return null;
  const last = r.reviews.at(-1)?.at ?? r.start;
  const at = abs(last) + REVIEW_HOURS * 60;
  const left = at - nowAbs;
  return { at, late: left < 0, text: left < 0 ? `見直しの時間を${durationText(-left)}過ぎています` : `次の見直しまで${durationText(left)}` };
}

export const activeOf = (all: Restraint[], patientId: string) => all.find((r) => r.patientId === patientId && !r.end);

/** A fictional ongoing restraint: 大浦さん (誤嚥性肺炎、点滴と経鼻酸素を何度も外す) since last night. */
export const INITIAL_RESTRAINTS: Restraint[] = [
  {
    id: "rs-1",
    patientId: "90010244",
    devices: ["ミトン"],
    why: "夜間に点滴と酸素のカニュラを何度も外し、点滴を引き抜きかけた",
    state: "夜間せん妄（CAM 陽性）。声かけで一時的に落ち着くが、数分で再び手を伸ばす",
    met: { 切迫性: "点滴の自己抜去と酸素の中断で、脱水と低酸素の危険が高い", 非代替性: "点滴を見えない位置にし、付き添いと頻回の訪室を試したが防げなかった", 一時性: "日中、抗菌薬の点滴が終わる時間帯は外す。夜間のみ" },
    tried: "点滴ルートを袖の中に通す、照明と時計で見当識を補う、30分ごとの訪室",
    doctor: "山本（専攻医）",
    confirmedBy: "看護師 渡辺",
    family: "長女に電話で説明（22:30、看護師 渡辺）",
    start: { day: -1, time: "22:00" },
    reviews: [{ at: { day: 0, time: "06:00" }, by: "看護師 渡辺", decision: "続ける", note: "明け方も手を伸ばす動作あり" }],
  },
];
