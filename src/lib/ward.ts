// Layout of the FICTIONAL ward "5階東". Room numbers skip 4 and 9, as many Japanese
// hospitals do. Patients of other teams are fictional too: each bed below gives the name, sex,
// age, department and a note, and ward-charts.ts makes a small chart for each from them.

import type { Patient, Sex } from "./types";

export interface Room {
  no: string;
  kind: "個室" | "4床室";
  beds: string[]; // bed letters; a private room has one bed ""
  /** Which side of the corridor the room is on. */
  side: "north" | "south";
}

export interface OtherPatient {
  name: string;
  sex: Sex;
  age: number;
  department: string;
  note?: string;
}

export interface BedAssignment {
  room: string;
  bed: string;
  patientId?: string; // one of our patients
  other?: OtherPatient;
}

const four = ["A", "B", "C", "D"];

export const WARD_NAME = "5階東病棟";

export const ROOMS: Room[] = [
  { no: "516", kind: "4床室", beds: four, side: "north" },
  { no: "515", kind: "4床室", beds: four, side: "north" },
  { no: "513", kind: "4床室", beds: four, side: "north" },
  { no: "512", kind: "個室", beds: [""], side: "north" },
  { no: "511", kind: "個室", beds: [""], side: "north" },
  { no: "510", kind: "個室", beds: [""], side: "north" },
  { no: "501", kind: "個室", beds: [""], side: "south" },
  { no: "502", kind: "個室", beds: [""], side: "south" },
  { no: "503", kind: "個室", beds: [""], side: "south" },
  { no: "505", kind: "4床室", beds: four, side: "south" },
  { no: "506", kind: "4床室", beds: four, side: "south" },
  { no: "507", kind: "4床室", beds: four, side: "south" },
  { no: "508", kind: "4床室", beds: four, side: "south" },
];

const o = (name: string, sex: Sex, age: number, department: string, note?: string): OtherPatient => ({ name, sex, age, department, note });

export const BEDS: BedAssignment[] = [
  // our patients
  { room: "512", bed: "", patientId: "90010231" },
  { room: "515", bed: "B", patientId: "90010244" },
  { room: "508", bed: "A", patientId: "90010198" },
  { room: "511", bed: "", patientId: "90010260" },
  // other teams (fictional)
  { room: "501", bed: "", other: o("岡部 正二", "男", 81, "呼吸器内科", "酸素投与中") },
  { room: "503", bed: "", other: o("村井 和子", "女", 77, "消化器内科") },
  { room: "505", bed: "A", other: o("堀 誠", "男", 68, "消化器内科", "明日退院") },
  { room: "505", bed: "B", other: o("西田 浩", "男", 59, "消化器内科", "検査予定") },
  { room: "505", bed: "D", other: o("小池 隆", "男", 73, "循環器内科") },
  { room: "506", bed: "A", other: o("上野 幸子", "女", 84, "総合診療科（B チーム）") },
  { room: "506", bed: "B", other: o("吉川 ミツ", "女", 90, "総合診療科（B チーム）", "転倒注意") },
  { room: "506", bed: "C", other: o("久保 恵", "女", 66, "消化器内科") },
  { room: "507", bed: "A", other: o("原 啓介", "男", 55, "循環器内科") },
  { room: "507", bed: "C", other: o("松尾 実", "男", 79, "呼吸器内科") },
  { room: "507", bed: "D", other: o("今井 武", "男", 70, "総合診療科（B チーム）", "新入院") },
  { room: "508", bed: "B", other: o("田村 昭", "男", 83, "循環器内科") },
  { room: "508", bed: "C", other: o("杉本 進", "男", 62, "消化器内科", "明日退院") },
  { room: "510", bed: "", other: o("坂口 典子", "女", 71, "呼吸器内科", "飛沫予防策") },
  { room: "513", bed: "A", other: o("石原 清子", "女", 75, "消化器内科") },
  { room: "513", bed: "B", other: o("中野 英子", "女", 88, "総合診療科（B チーム）") },
  { room: "513", bed: "D", other: o("横山 文子", "女", 69, "循環器内科", "検査予定") },
  { room: "515", bed: "A", other: o("野口 ハル", "女", 92, "総合診療科（B チーム）") },
  { room: "515", bed: "C", other: o("菅原 洋子", "女", 58, "消化器内科") },
  { room: "516", bed: "B", other: o("藤井 さよ", "女", 80, "呼吸器内科") },
  { room: "516", bed: "C", other: o("高田 由美", "女", 63, "消化器内科", "新入院") },
  { room: "516", bed: "D", other: o("安藤 キヨ", "女", 86, "循環器内科") },
];

/** The ward as it stands: bed assignments (initial ones plus today's admissions) and a patient lookup. */
export interface WardState {
  beds: BedAssignment[];
  patient: (id: string) => Patient | undefined;
}

export function occupant(beds: BedAssignment[], room: string, bed: string): BedAssignment | undefined {
  return beds.find((b) => b.room === room && b.bed === bed);
}

export function emptyBeds(beds: BedAssignment[], rooms: Room[] = ROOMS): { room: Room; bed: string }[] {
  return rooms.flatMap((room) => room.beds.filter((bed) => !occupant(beds, room.no, bed)).map((bed) => ({ room, bed })));
}

/** Sex of the people already in a shared room, if any (shared rooms are single-sex on this ward). */
export function roomSex(ward: WardState, roomNo: string): Sex | null {
  for (const b of ward.beds.filter((x) => x.room === roomNo)) {
    const sex = b.patientId ? ward.patient(b.patientId)?.sex : b.other?.sex;
    if (sex) return sex;
  }
  return null;
}

/** Isolation shown on the map (by infection, or the precaution the record names). Display only. */
export function isolationFor(infections: string[]): string | null {
  if (infections.some((i) => i.includes("MRSA"))) return "接触予防策";
  // The record says which precaution is taken, e.g. 「インフルエンザ A 型（飛沫予防策）」.
  return infections.map((i) => i.match(/(接触|飛沫|空気)予防策/)?.[0]).find((x) => !!x) ?? null;
}

// ---------------------------------------------------------------------------
// Who looks after whom today, and the ward's plans (all FICTIONAL)
// ---------------------------------------------------------------------------

/** 日勤 nurse in charge of each room today (fictional). */
const NURSE_BY_ROOM: Record<string, string> = {
  "501": "看護師 佐々木", "502": "看護師 佐々木", "503": "看護師 佐々木", "505": "看護師 佐々木",
  "506": "看護師 高橋", "507": "看護師 高橋", "508": "看護師 高橋",
  "510": "看護師 伊藤", "511": "看護師 伊藤", "512": "看護師 伊藤", "513": "看護師 伊藤",
  "515": "看護師 渡辺", "516": "看護師 渡辺",
  // 5階南
  "520": "看護師 岡本", "521": "看護師 岡本", "522": "看護師 岡本", "523": "看護師 岡本",
  "525": "看護師 長谷川", "526": "看護師 長谷川", "527": "看護師 長谷川",
  "530": "看護師 村上", "531": "看護師 村上", "532": "看護師 村上", "533": "看護師 村上",
  "535": "看護師 森", "536": "看護師 森",
  // 6階東
  "601": "看護師 近藤", "602": "看護師 近藤", "603": "看護師 近藤", "605": "看護師 近藤",
  "606": "看護師 坂本", "607": "看護師 坂本", "608": "看護師 坂本",
  "610": "看護師 遠藤", "611": "看護師 遠藤", "612": "看護師 遠藤", "613": "看護師 遠藤",
  "615": "看護師 青山", "616": "看護師 青山",
};

export function nurseFor(room: string): string {
  return NURSE_BY_ROOM[room] ?? "（未定）";
}

/** Attending doctors of the other teams (fictional), by department. */
const DOCTOR_BY_DEPARTMENT: Record<string, string> = {
  消化器内科: "田村（消化器内科）",
  循環器内科: "中川（循環器内科）",
  呼吸器内科: "佐藤（呼吸器内科）",
  "総合診療科（B チーム）": "木下（総合診療科 B）",
  整形外科: "森本（整形外科）",
  脳神経内科: "林（脳神経内科）",
  外科: "石川（外科）",
  腎臓内科: "井上（腎臓内科）",
  泌尿器科: "前田（泌尿器科）",
};

export function doctorFor(department: string): string {
  return DOCTOR_BY_DEPARTMENT[department] ?? department;
}

export interface WardPlan {
  kind: "入院" | "退院";
  /** 0 = today, 1 = tomorrow. */
  day: 0 | 1;
  time: string;
  name: string;
  sex: Sex;
  age: number;
  department: string;
  room: string;
  bed: string;
  note?: string;
}

/** Planned admissions and discharges for today and tomorrow (fictional). Admissions go to empty beds. */
export const WARD_PLANS: WardPlan[] = [
  { kind: "入院", day: 0, time: "14:00", name: "小川 節子", sex: "女", age: 78, department: "総合診療科（B チーム）", room: "513", bed: "C", note: "紹介・肺炎の疑い" },
  { kind: "退院", day: 1, time: "10:00", name: "堀 誠", sex: "男", age: 68, department: "消化器内科", room: "505", bed: "A" },
  { kind: "退院", day: 1, time: "11:00", name: "杉本 進", sex: "男", age: 62, department: "消化器内科", room: "508", bed: "C" },
  { kind: "入院", day: 1, time: "10:30", name: "太田 実", sex: "男", age: 66, department: "消化器内科", room: "507", bed: "B", note: "大腸内視鏡の検査入院" },
];

// ---------------------------------------------------------------------------
// The other wards of the fictional hospital. The people on 5階南 and 6階東 are fictional, so that the
// floor list and the all-ward list read as a hospital; ward-charts.ts makes a small chart for each.
// ---------------------------------------------------------------------------

export interface Floor {
  name: string;
  rooms: Room[];
}

/**
 * Rooms laid out like 5階東: north 4床室 ×3 and 個室 ×3, south 個室 ×3 and 4床室 ×4. Numbers in that
 * order, skipping 4 and 9 as on 5階東.
 */
function layout(nos: string[]): Room[] {
  const kinds: [Room["kind"], Room["side"]][] = [
    ["4床室", "north"], ["4床室", "north"], ["4床室", "north"], ["個室", "north"], ["個室", "north"], ["個室", "north"],
    ["個室", "south"], ["個室", "south"], ["個室", "south"], ["4床室", "south"], ["4床室", "south"], ["4床室", "south"], ["4床室", "south"],
  ];
  return nos.map((no, i) => ({ no, kind: kinds[i][0], beds: kinds[i][0] === "4床室" ? four : [""], side: kinds[i][1] }));
}

export const FLOORS: Floor[] = [
  { name: WARD_NAME, rooms: ROOMS },
  { name: "5階南病棟", rooms: layout(["536", "535", "533", "532", "531", "530", "520", "521", "522", "523", "525", "526", "527"]) },
  { name: "6階東病棟", rooms: layout(["616", "615", "613", "612", "611", "610", "601", "602", "603", "605", "606", "607", "608"]) },
];

export const floorOf = (room: string): string => FLOORS.find((f) => f.rooms.some((r) => r.no === room))?.name ?? WARD_NAME;

const at = (room: string, bed: string, other: OtherPatient): BedAssignment => ({ room, bed, other });

/** Patients of the other wards (all fictional, other teams). 5階南 rooms are 520–536, 6階東 601–616. */
export const OTHER_FLOOR_BEDS: BedAssignment[] = [
  // 5階南病棟（整形外科・脳神経内科・外科）
  at("520", "", o("森田 健一", "男", 74, "脳神経内科", "リハビリ中")),
  at("521", "", o("青木 トシ", "女", 88, "整形外科", "術後")),
  at("523", "A", o("宮崎 達也", "男", 45, "外科", "術後2日目")),
  at("523", "B", o("大塚 茂", "男", 67, "整形外科")),
  at("523", "D", o("内田 勝", "男", 81, "脳神経内科")),
  at("525", "A", o("柴田 和枝", "女", 79, "整形外科", "術後")),
  at("525", "B", o("島田 久美子", "女", 52, "外科")),
  at("525", "C", o("平野 ふみ", "女", 91, "整形外科", "転倒注意")),
  at("526", "A", o("工藤 修二", "男", 58, "脳神経内科")),
  at("526", "B", o("高野 義男", "男", 76, "外科", "明日手術")),
  at("526", "C", o("野村 一郎", "男", 63, "整形外科")),
  at("526", "D", o("水野 清", "男", 85, "脳神経内科")),
  at("527", "A", o("桜井 美代子", "女", 70, "外科")),
  at("527", "C", o("酒井 千代", "女", 83, "脳神経内科")),
  at("527", "D", o("荒木 洋子", "女", 61, "整形外科", "明日退院")),
  at("530", "", o("金子 博之", "男", 69, "外科", "術後1日目")),
  at("531", "", o("関 さち子", "女", 77, "脳神経内科")),
  at("533", "A", o("熊谷 進", "男", 72, "整形外科")),
  at("533", "B", o("菊地 正", "男", 54, "外科")),
  at("533", "D", o("千葉 栄一", "男", 80, "脳神経内科")),
  at("535", "A", o("岩崎 由紀", "女", 48, "外科")),
  at("535", "B", o("松本 静", "女", 86, "整形外科")),
  at("535", "C", o("中島 トミ", "女", 93, "脳神経内科")),
  at("535", "D", o("大橋 京子", "女", 73, "整形外科")),
  at("536", "A", o("武田 勇", "男", 66, "整形外科")),
  at("536", "C", o("小松 和夫", "男", 78, "外科")),
  at("536", "D", o("新井 秀樹", "男", 57, "脳神経内科")),
  // 6階東病棟（腎臓内科・泌尿器科・呼吸器内科）
  at("601", "", o("古川 弘", "男", 71, "腎臓内科", "透析導入")),
  at("602", "", o("片山 ひさ", "女", 84, "呼吸器内科", "酸素投与中")),
  at("603", "", o("吉田 隆", "男", 65, "泌尿器科")),
  at("605", "A", o("本田 誠一", "男", 59, "泌尿器科", "術後1日目")),
  at("605", "B", o("小島 昇", "男", 77, "腎臓内科")),
  at("605", "C", o("広瀬 勉", "男", 82, "呼吸器内科")),
  at("606", "A", o("大野 恵子", "女", 68, "腎臓内科")),
  at("606", "B", o("藤田 静江", "女", 89, "呼吸器内科")),
  at("606", "D", o("西村 加代", "女", 74, "泌尿器科")),
  at("607", "A", o("浅野 健", "男", 63, "呼吸器内科")),
  at("607", "B", o("永井 光男", "男", 79, "腎臓内科")),
  at("607", "C", o("上田 和也", "男", 50, "泌尿器科")),
  at("607", "D", o("山口 正夫", "男", 87, "呼吸器内科", "明日退院")),
  at("608", "A", o("石井 春子", "女", 81, "腎臓内科")),
  at("608", "C", o("河野 早苗", "女", 66, "呼吸器内科")),
  at("610", "", o("福田 直人", "男", 73, "呼吸器内科", "飛沫予防策")),
  at("612", "", o("小野 さくら", "女", 58, "腎臓内科")),
  at("613", "A", o("増田 輝夫", "男", 70, "泌尿器科")),
  at("613", "B", o("杉山 守", "男", 84, "腎臓内科")),
  at("613", "D", o("樋口 修", "男", 61, "呼吸器内科")),
  at("615", "A", o("久保田 礼子", "女", 76, "呼吸器内科")),
  at("615", "B", o("安田 君子", "女", 92, "腎臓内科")),
  at("615", "C", o("菅野 美智子", "女", 63, "泌尿器科")),
  at("616", "B", o("岡田 博", "男", 68, "腎臓内科")),
  at("616", "C", o("中山 武", "男", 75, "泌尿器科")),
];
