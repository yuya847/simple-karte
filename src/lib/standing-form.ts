import { abs } from "./flowsheet";
import { changeKey, type WorkPatient } from "./worksheet";
import { currentLines, type LineCat, type StandingLine } from "./standing-lines";

export const CATEGORY_LABELS: Partial<Record<LineCat, string>> = { 安静: "安静度", バイタル: "バイタル測定", 呼出基準: "Dr.call の条件" };
export const STANDING_CHOICES: Partial<Record<LineCat, readonly string[]>> = {
  安静: ["ベッド上", "室内", "病棟内", "院内フリー"],
  ADL: ["自立", "一部介助", "全介助"],
  食事: ["常食", "軟菜食", "全粥", "絶食（水分はよい）", "絶食（水分もとらない）"],
  清潔: ["入浴", "シャワー", "清拭"],
  排泄: ["トイレ", "ポータブル", "おむつ"],
  バイタル: ["1日1回", "1日3回", "4時間ごと", "2時間ごと"],
};
export const composeStandingText = (choice: string, comment: string) => [choice.trim(), comment.trim()].filter(Boolean).join("\n");
export function splitStandingText(cat: LineCat, text: string) {
  const [first, ...rest] = text.split("\n");
  return STANDING_CHOICES[cat]?.includes(first) ? { choice: first, comment: rest.join("\n") } : { choice: "", comment: text };
}

export const STANDING_SOURCES = [
  { label: "日本糖尿病学会：低血糖およびシックデイ（経口摂取可能な場合のブドウ糖10g）", url: "https://www.jds.or.jp/uploads/fckeditor/files/uid000025_67756964655F323031382D323031395F30372E706466.pdf" },
  { label: "PMDA：アセトアミノフェンの添付文書（急性上気道炎の解熱は原則1日2回まで。適応によって用量が異なります）", url: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/ResultDataSetPDF/172190_1141007F1063_5_06" },
  { label: "PMDA：ロキソプロフェンの添付文書（疼痛の用量。急性上気道炎の解熱とは区別）", url: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/ResultDataSetPDF/170329_1149019F1480_3_02" },
];

/** Text orders remain text: no drug, dose or automated administration limit is inferred. */
export function worksheetPrnLines(lines: StandingLine[], person: WorkPatient, now: number, taken: Record<string, string>, sessionKeys: Set<string>) {
  return currentLines(lines).filter((l) => l.cat === "頓用" && abs(l.start.day, l.start.time ?? "00:00") <= now && (!l.end || abs(l.end.day, l.end.time ?? "23:59") >= now) && (!sessionKeys.has(changeKey(l.id, "新規")) || !!taken[changeKey(l.id, "新規")])).map((l) => ({ id: l.id, patientId: person.patient.id, room: person.room, name: person.patient.name, text: l.text }));
}
