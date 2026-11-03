// Advance directives and other postings shown on the patient band (患者の掲示).
// The doctor records what was decided with the patient or family; the app only shows it, keeps the
// history, and reminds when the agreed review day comes. AI does not suggest a code status.

export type CprChoice = "未確認" | "行う" | "行わない（DNAR）";
export type ItemChoice = "未確認" | "行う" | "行わない";
export const DIRECTIVE_ITEMS = ["気管挿管・人工呼吸", "昇圧薬", "透析", "輸血"] as const;
export type DirectiveItem = (typeof DIRECTIVE_ITEMS)[number];

export interface AdvanceDirective {
  id: string;
  patientId: string;
  cpr: CprChoice;
  items: Record<DirectiveItem, ItemChoice>;
  /** Who took part in the discussion (本人, 長男 ○○ …). */
  discussedWith: string;
  decidedAt: { day: number; time: string };
  by: string;
  /** Day to talk again (day offset), if agreed. */
  reviewOn?: number;
  note?: string;
  /** Replaced by a newer one, or cancelled. */
  status: "有効" | "取消";
}

/** Japanese Society of Intensive Care Medicine, recommendation on DNAR orders (2017). */
export const DNAR_NOTE = "DNAR は心停止のときに心肺蘇生をしない指示で、それ以外の治療（酸素・点滴・抗菌薬など）を控えることではありません。ほかの治療は項目ごとに話し合って決めます。";
export const DNAR_SOURCE = "日本集中治療医学会「Do Not Attempt Resuscitation（DNAR）指示のあり方についての勧告」2017年";

export const current = (list: AdvanceDirective[], patientId: string) => list.filter((d) => d.patientId === patientId && d.status === "有効").at(-1);

/** One line for the note and the band. */
export function directiveLine(d: AdvanceDirective): string {
  const decided = DIRECTIVE_ITEMS.filter((k) => d.items[k] !== "未確認").map((k) => `${k}：${d.items[k]}`);
  return [`心肺蘇生：${d.cpr}`, ...decided].join("、") + (d.discussedWith ? `（${d.discussedWith}と話し合い）` : "");
}

/** The band label, e.g. "DNAR" or "心肺蘇生：行う". */
export const bandLabel = (d?: AdvanceDirective) => (!d || d.cpr === "未確認" ? "未確認" : d.cpr === "行わない（DNAR）" ? "DNAR" : "心肺蘇生 行う");

/** Review day has come (or passed). */
export const reviewDue = (d: AdvanceDirective | undefined, today = 0) => d?.reviewOn !== undefined && d.reviewOn <= today;

export const emptyItems = (): Record<DirectiveItem, ItemChoice> => Object.fromEntries(DIRECTIVE_ITEMS.map((k) => [k, "未確認"])) as Record<DirectiveItem, ItemChoice>;

/** FICTIONAL starting data: 大浦さん (86, aspiration pneumonia) decided with her family on admission. */
export const INITIAL_DIRECTIVES: AdvanceDirective[] = [
  {
    id: "ad-90010244",
    patientId: "90010244",
    cpr: "行わない（DNAR）",
    items: { "気管挿管・人工呼吸": "行わない", 昇圧薬: "未確認", 透析: "行わない", 輸血: "行う" },
    discussedWith: "長女（キーパーソン、架空）",
    decidedAt: { day: -1, time: "17:30" },
    by: "山本（専攻医）",
    reviewOn: 6,
    note: "本人は「苦しいことはしないでほしい」と以前から話していたと長女より。肺炎の治療（抗菌薬・酸素・点滴）は続ける。",
    status: "有効",
  },
];
