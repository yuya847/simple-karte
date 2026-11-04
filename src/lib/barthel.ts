// Barthel Index（BI、基本的日常生活活動度）: the ten items and their scores as the 診療報酬 forms list them
// (別紙様式7の2・別紙様式21), with short criteria from the MHLW material. The therapist chooses each score;
// code only adds them up and points out a fall of 10 or more within a week (the 通知's sign of 急性増悪).
// FIM is not reproduced here: its terms of use were not checked (別紙様式21 asks for BI or FIM).

import type { DayOffset } from "./types";

export const BI_SOURCES = [
  { label: "厚生労働省「診療報酬の算定方法の一部改正に伴う実施上の留意事項について」（令和8年3月5日 保医発0305第6号）様式（医科）別紙様式7の2（項目と点数候補）・別紙様式21（BI 0〜100）", url: "https://www.mhlw.go.jp/content/12400000/001713885.pdf" },
  { label: "厚生労働省 老健局の資料「別添資料2 ADL：Barthel Index」（各点数の判定基準）", url: "https://www.mhlw.go.jp/content/12300000/001239045.docx" },
  { label: "Mahoney FI, Barthel DW. Functional evaluation: the Barthel Index. Md State Med J. 1965;14:61-65（原典）", url: "https://pubmed.ncbi.nlm.nih.gov/14258950/" },
];

export interface BiOption {
  score: number;
  text: string;
}

export interface BiItem {
  key: string;
  /** 別紙様式7の2 の項目名. */
  label: string;
  options: BiOption[];
}

/** The ten items in the order of 別紙様式7の2. The criteria are short summaries of the MHLW material. */
export const BI_ITEMS: BiItem[] = [
  { key: "eat", label: "食事", options: [{ score: 10, text: "自立（必要なら自助具を使い、適切な時間内に食べ終える）" }, { score: 5, text: "部分介助（食べ物を切るなどの介助が要る）" }, { score: 0, text: "全介助" }] },
  {
    key: "transfer",
    label: "車椅子からベッドへの移動",
    options: [{ score: 15, text: "自立（ブレーキ・フットレストの操作を含め、すべて一人でできる）" }, { score: 10, text: "部分介助または監視が要る" }, { score: 5, text: "座ることはできるが、移乗は全介助" }, { score: 0, text: "全介助" }],
  },
  { key: "groom", label: "整容", options: [{ score: 5, text: "自立（洗面・歯磨き・整髪・ひげそり）" }, { score: 0, text: "全介助" }] },
  { key: "toilet", label: "トイレ動作", options: [{ score: 10, text: "自立（衣服の操作・後始末を含む）" }, { score: 5, text: "部分介助（体を支える、トイレットペーパーを使うなど）" }, { score: 0, text: "全介助" }] },
  { key: "bath", label: "入浴", options: [{ score: 5, text: "自立（浴槽につかる、シャワーを使う）" }, { score: 0, text: "全介助" }] },
  {
    key: "walk",
    label: "歩行",
    options: [{ score: 15, text: "自立（45m 以上の平地歩行。補装具は可、車椅子・歩行器は不可）" }, { score: 10, text: "介助や監視があれば 45m の平地歩行ができる" }, { score: 5, text: "歩けないが、車椅子を操作して 45m 以上移動できる" }, { score: 0, text: "全介助" }],
  },
  { key: "stairs", label: "階段昇降", options: [{ score: 10, text: "自立（手すり・杖は可）" }, { score: 5, text: "介助または監視が要る" }, { score: 0, text: "全介助" }] },
  { key: "dress", label: "着替え", options: [{ score: 10, text: "自立（靴・ファスナー・装具の着脱を含む）" }, { score: 5, text: "部分介助（半分以上は自分で、適切な時間内にできる）" }, { score: 0, text: "全介助" }] },
  { key: "bowel", label: "排便コントロール", options: [{ score: 10, text: "失禁なし（浣腸・坐薬の取り扱いもできる）" }, { score: 5, text: "ときに失禁あり（浣腸・坐薬の取り扱いに介助が要る）" }, { score: 0, text: "全介助" }] },
  { key: "bladder", label: "排尿コントロール", options: [{ score: 10, text: "失禁なし" }, { score: 5, text: "ときに失禁あり（収尿器の取り扱いの介助を含む）" }, { score: 0, text: "全介助" }] },
];

export const BI_MAX = BI_ITEMS.reduce((s, i) => s + Math.max(...i.options.map((o) => o.score)), 0);

export interface BiEval {
  id: string;
  patientId: string;
  day: DayOffset;
  time: string;
  by: string;
  scores: Record<string, number>;
  note?: string;
}

/** What is missing or not a score of the item. */
export function biProblems(scores: Record<string, number>): string[] {
  return BI_ITEMS.flatMap((i) => {
    const v = scores[i.key];
    if (v === undefined) return [`${i.label}を選んでください。`];
    return i.options.some((o) => o.score === v) ? [] : [`${i.label}の ${v}点は点数の候補（${i.options.map((o) => o.score).join("・")}）にありません。`];
  });
}

/** The total (0〜100), or null while an item is not scored. */
export function biTotal(scores: Record<string, number>): number | null {
  return biProblems(scores).length ? null : BI_ITEMS.reduce((s, i) => s + scores[i.key], 0);
}

export const biOf = (evals: BiEval[], patientId: string): BiEval[] => evals.filter((e) => e.patientId === patientId).sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));

/**
 * 急性増悪 in 第7部 通則9 of the 留意事項通知 includes a fall of BI by 10 or more within a week. Shown for the doctor
 * to judge (code does not decide that the patient worsened).
 */
export function biDrops(evals: BiEval[]): { from: BiEval; to: BiEval; drop: number }[] {
  const scored = evals.filter((e) => biTotal(e.scores) !== null);
  const out: { from: BiEval; to: BiEval; drop: number }[] = [];
  for (let j = 1; j < scored.length; j++) {
    const to = scored[j];
    const within = scored.slice(0, j).filter((e) => to.day - e.day <= 7);
    const best = within.reduce<BiEval | null>((m, e) => (m === null || biTotal(e.scores)! > biTotal(m.scores)! ? e : m), null);
    if (best && biTotal(best.scores)! - biTotal(to.scores)! >= 10) out.push({ from: best, to, drop: biTotal(best.scores)! - biTotal(to.scores)! });
  }
  return out;
}

export const BI_DROP_NOTE = "留意事項通知 第7部 通則9 は、急性増悪の例として「1週間以内に FIM 又は BI が 10 以上（指定難病は 5 以上）低下するような状態」を挙げています。急性増悪かどうかは医師が判断します。";

export const FIM_NOTE = "FIM（機能的自立度評価法）は、利用の条件を確かめていないため、この試作には載せていません。別紙様式21 は BI か FIM のどちらかを必ず書く様式なので、BI で書きます。";
