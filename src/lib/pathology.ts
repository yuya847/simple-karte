// 病理 of the fictional hospital: the doctor's request (組織診・細胞診・術中迅速), the technologists' 受付
// and steps (切り出し・標本作製・鏡検), the pathologist's report, and the attending doctor marking it as read.
// The 受付番号, what step comes next, what a request still lacks and how long a case has been in the
// laboratory are worked out in code. The pathologist (a doctor) writes the diagnosis; code never does.
// All cases are fictional.

import { abs } from "./flowsheet";
import type { ResultItem } from "./results";
import type { DayOffset } from "./types";

export type PathKind = "組織診" | "細胞診" | "術中迅速";
export const PATH_KINDS: PathKind[] = ["組織診", "細胞診", "術中迅速"];

/** The steps between 受付 and the report, by kind. */
export const PATH_STEPS: Record<PathKind, string[]> = {
  組織診: ["切り出し", "標本作製", "鏡検"],
  細胞診: ["標本作製", "鏡検"],
  術中迅速: ["凍結切片作製", "鏡検"],
};

export const PATH_METHODS: Record<PathKind, string[]> = {
  組織診: ["生検", "内視鏡下生検", "手術（切除）", "針生検", "その他"],
  細胞診: ["喀痰", "尿（自然尿）", "胸水", "腹水", "穿刺吸引", "擦過", "その他"],
  術中迅速: ["手術中の切除検体", "その他"],
};

const PREFIX: Record<PathKind, string> = { 組織診: "S", 細胞診: "C", 術中迅速: "F" };

/** The fictional hospital's rules for 病理 (shown on the screen as such). */
export const PATH_RULES = {
  numbering: "受付番号は、種類の頭文字（組織診 S・細胞診 C・術中迅速 F）＋西暦の下2桁＋その年の通し番号（この架空の病院の取り決め）。",
  report: "病理診断の報告書は病理医（医師）が書きます。主治医が読んで「確認した」を押すと、誰がいつ読んだかが残ります（この架空の病院の取り決め）。",
  frozen: "術中迅速は、病理医が手術室の術者に電話で直接結果を伝え、伝えた相手と時刻を残します。後日の永久標本の報告で確かめます（この架空の病院の取り決め）。",
  important: "病理医が「重要な所見」とした報告は、主治医に直接伝えたことも残します（この架空の病院の取り決め）。",
} as const;

export interface Moment {
  day: DayOffset;
  time: string;
}

export interface PathRequest {
  kind: PathKind;
  /** 臓器・部位 (e.g. 右下腿 皮膚). */
  site: string;
  method: string;
  /** 容器・検体の数. */
  containers: number;
  /** 臨床診断と経過. */
  clinical: string;
  /** 病理に知りたいこと. */
  question: string;
  /** 組織診：ホルマリン固定を始めた時刻（わかれば）. */
  fixed?: Moment;
  /** 術中迅速：手術室・予定の時刻・結果を伝える電話. */
  frozen?: { room: string; at: Moment; phone: string };
}

export interface PathReport extends Moment {
  diagnosis: string;
  findings: string;
  comment?: string;
  by: string;
  /** The pathologist marked it as needing a direct word with the attending. */
  important: boolean;
  /** Why this version replaced the one before (訂正・追加報告). */
  reason?: string;
}

export interface PathCase extends PathRequest {
  id: string;
  patientId: string;
  ordered: Moment & { by: string };
  received?: Moment & { by: string; number: string };
  steps: (Moment & { step: string; by: string; note?: string })[];
  report?: PathReport;
  /** Earlier versions of the report, oldest first. */
  earlier?: PathReport[];
  /** The result phoned to the surgeon (術中迅速) or the attending (重要な所見). */
  called?: Moment & { by: string; to: string };
}

const mins = (m: Moment) => abs(m.day, m.time);

/** What the request still lacks (the doctor fills these in). */
export function requestProblems(r: PathRequest): string[] {
  const out: string[] = [];
  if (!r.site.trim()) out.push("臓器・部位");
  if (!r.method.trim()) out.push("採取の方法");
  if (!(r.containers >= 1)) out.push("容器の数");
  if (!r.clinical.trim()) out.push("臨床診断・経過");
  if (!r.question.trim()) out.push("知りたいこと");
  if (r.kind === "術中迅速") {
    if (!r.frozen?.room.trim()) out.push("手術室");
    if (!r.frozen?.at.time) out.push("予定の時刻");
    if (!r.frozen?.phone.trim()) out.push("結果を伝える電話");
  }
  return out;
}

export type PathStatus = "受付待ち" | "工程中" | "報告待ち" | "報告済み";

/** The next thing to do on the case: 受付, a step, 報告, or nothing. */
export function nextStep(c: PathCase): string | null {
  if (!c.received) return "受付";
  const left = PATH_STEPS[c.kind].find((s) => !c.steps.some((x) => x.step === s));
  if (left) return left;
  return c.report ? null : "報告";
}

export function pathStatus(c: PathCase): PathStatus {
  const n = nextStep(c);
  return n === "受付" ? "受付待ち" : n === "報告" ? "報告待ち" : n === null ? "報告済み" : "工程中";
}

/** The next 受付番号 of the kind in the year (the fictional numbering). */
export function nextNumber(cases: PathCase[], kind: PathKind, year: number): string {
  const head = `${PREFIX[kind]}${String(year % 100).padStart(2, "0")}-`;
  const used = cases.map((c) => c.received?.number ?? "").filter((n) => n.startsWith(head)).map((n) => Number(n.slice(head.length)) || 0);
  return `${head}${String(Math.max(0, ...used) + 1).padStart(4, "0")}`;
}

/** Days since 受付 (the day of 受付 is day 0), or null before 受付. */
export const daysIn = (c: PathCase, nowAbs: number): number | null => (c.received ? Math.floor(nowAbs / 1440) - c.received.day : null);

/** What stops the report from being confirmed. */
export function reportProblems(c: PathCase, r: Pick<PathReport, "diagnosis" | "reason">): string[] {
  const out: string[] = [];
  if (nextStep(c) !== "報告" && !c.report) out.push(`先に「${nextStep(c)}」を記録してください。`);
  if (!r.diagnosis.trim()) out.push("病理診断を書いてください。");
  if (c.report && !r.reason?.trim()) out.push("訂正・追加報告の理由を書いてください。");
  return out;
}

/** The version number of the report in force (1 for the first). */
export const versionOf = (c: PathCase) => (c.report ? (c.earlier?.length ?? 0) + 1 : 0);

/** "組織診 右下腿 皮膚（生検）"; the method is not repeated when it already names the site ("細胞診 喀痰", "細胞診 尿（自然尿）"). */
export function caseTitle(c: Pick<PathCase, "kind" | "site" | "method">): string {
  const m = c.method.trim();
  if (!m || m === c.site) return `${c.kind} ${c.site}`;
  if (m.startsWith(c.site)) return `${c.kind} ${m}`;
  return `${c.kind} ${c.site}（${m}）`;
}

/** Reports as results the attending marks as read (a new version is a new result). */
export function pathResultItems(cases: PathCase[]): ResultItem[] {
  return cases
    .filter((c) => c.report)
    .map((c) => {
      const r = c.report!;
      const v = versionOf(c);
      return {
        key: `path|${c.id}|v${v}`,
        patientId: c.patientId,
        kind: "病理" as const,
        day: r.day,
        time: r.time,
        title: `${caseTitle(c)}${c.received ? ` ${c.received.number}` : ""}${v > 1 ? "（訂正）" : ""}`,
        detail: `${r.important ? "【重要な所見】" : ""}${r.diagnosis.split(/\n/)[0]}`,
        panic: [],
        ...(v > 1 ? { corrected: `訂正・追加報告（第${v}版）：${r.reason ?? ""}（${r.time} ${r.by}）` } : {}),
      };
    });
}

// ---------------------------------------------------------------------------
// Fictional cases of this demo, at different steps.
// ---------------------------------------------------------------------------

export function initialPathology(nowAbs: number): PathCase[] {
  const hhmm = (a: number) => {
    const m = ((a % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };
  const today = (back: number): Moment => ({ day: 0, time: hhmm(Math.max(0, nowAbs - back)) });
  const DR = "山本（専攻医）";
  const TECH = "検査技師 中村";
  return [
    {
      id: "path-demo-1",
      patientId: "90010244",
      kind: "細胞診",
      site: "喀痰",
      method: "喀痰",
      containers: 1,
      clinical: "誤嚥性肺炎で入院。86歳、喫煙歴なし。",
      question: "悪性細胞の有無。",
      ordered: { day: -1, time: "12:10", by: DR },
      received: { day: -1, time: "14:30", by: TECH, number: "C26-0311" },
      steps: [
        { step: "標本作製", day: -1, time: "15:40", by: TECH, note: "パパニコロウ染色" },
        { step: "鏡検", ...today(150), by: "細胞検査士 中村（架空）" },
      ],
      report: {
        ...today(40),
        diagnosis: "悪性細胞を認めない。",
        findings: "好中球と細菌の塊が多数みられ、炎症性の背景。扁平上皮細胞と組織球を少数認める。異型細胞はみられない。",
        by: "病理医 岡田（架空）",
        important: false,
      },
    },
    {
      id: "path-demo-2",
      patientId: "90010231",
      kind: "組織診",
      site: "右下腿 皮膚",
      method: "生検",
      containers: 1,
      clinical: "右下腿蜂窩織炎として抗菌薬で治療中。紅斑の一部が残り、ほかの皮膚の病気との区別のため生検。",
      question: "蜂窩織炎として矛盾しないか。血管炎などの所見の有無。",
      fixed: { day: -1, time: "16:20" },
      ordered: { day: -1, time: "15:50", by: DR },
      received: { day: -1, time: "16:45", by: TECH, number: "S26-1024" },
      steps: [
        { step: "切り出し", day: 0, time: hhmm(Math.max(0, Math.min(nowAbs - 120, 9 * 60))), by: "病理医 岡田（架空）" },
        { step: "標本作製", ...today(30), by: TECH, note: "HE 染色" },
      ],
    },
    {
      id: "path-demo-3",
      patientId: "90010260",
      kind: "細胞診",
      site: "尿",
      method: "尿（自然尿）",
      containers: 1,
      clinical: "急性腎盂腎炎で治療中。尿潜血が続く。",
      question: "尿路上皮の異型細胞の有無。",
      ordered: { ...today(20), by: DR },
      steps: [],
    },
  ];
}

/** Cases ordered for a patient, newest first. */
export const casesOf = (cases: PathCase[], patientId: string) => cases.filter((c) => c.patientId === patientId).sort((a, b) => mins(b.ordered) - mins(a.ordered));
