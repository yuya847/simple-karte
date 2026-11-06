import { lineEffective } from "./standing-calendar";
import { changeKey, type WorkPatient } from "./worksheet";
import { type LineCat, type StandingLine } from "./standing-lines";

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
  const day = Math.floor(now / 1440);
  const minutes = now - day * 1440;
  const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return lines.filter((l) => lineEffective(l, day, time) && l.cat === "頓用" && (!sessionKeys.has(changeKey(l.id, "新規")) || !!taken[changeKey(l.id, "新規")])).map((l) => ({ id: l.id, patientId: person.patient.id, room: person.room, name: person.patient.name, text: l.text.split("\n").slice(0, 4).join("\n") }));
}

/** One hospital template; the doctor reviews the draft before confirming. */
export const ADMISSION_TEMPLATE = {
  label: "入院時指示（一般）",
  hint: "安静度・清潔・測定・頓用・Dr.call の例です。医師が患者の状態に合わせて直し、確定します。食事は食事オーダで別に出します。不眠時は医師に連絡し、睡眠薬はオーダで出します。",
  draft: (base: import("./standing").StandingOrders): import("./standing").StandingOrders => ({
    ...base, until: undefined, taken: undefined,
    rest: base.rest ?? "病棟内歩行", bath: "清拭", vitals: "1日3回", weight: "毎朝",
    calls: [{ key: "sbpHigh", value: 180 }, { key: "sbpLow", value: 90 }, { key: "hrHigh", value: 120 }, { key: "hrLow", value: 40 }, { key: "spo2", value: 92 }],
    callConscious: true,
    prn: [
      { id: "admission-fever", when: "発熱時", detail: "38℃以上", drug: { code: "ORAL-APAP500", amount: 1, unit: "錠" }, intervalH: 6, maxPerDay: 2 },
      { id: "admission-pain", when: "疼痛時", detail: "発熱時と同じ薬。併用時は医師に確認", drug: { code: "ORAL-APAP500", amount: 1, unit: "錠" }, intervalH: 6, maxPerDay: 3 },
    ],
    other: [base.other, "不眠時：医師に連絡（睡眠薬はオーダで出す）", "体温38.5℃以上が頓用で下がらないとき、または排尿が6時間以上ないとき医師を呼ぶ"].filter(Boolean).join("\n"),
  }),
};
