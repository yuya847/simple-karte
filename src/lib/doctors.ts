// The doctors one can enter as, inside the 医師 role (all FICTIONAL). The demo has no login: the role is
// chosen, and for 医師 also the person. 山本チーム looks after the four ward patients that have charts.

import { STAFF } from "./roles";

/** 研修医 = 初期研修医. 専攻医 is a 上級医 to a 研修医 (研修医よりも臨床経験の長い医師). 医師 = a doctor of another team. */
export type DoctorRank = "研修医" | "専攻医" | "指導医" | "医師";

export interface Doctor {
  name: string;
  rank: DoctorRank;
  team: string;
  /** One line shown when choosing. */
  note: string;
}

export const YAMAMOTO_TEAM = "総合診療科 A（山本チーム）";

export const DOCTORS: Doctor[] = [
  { name: STAFF.医師.name, rank: "専攻医", team: YAMAMOTO_TEAM, note: "主治医。研修医から見ると上級医" },
  { name: "研修医 田中", rank: "研修医", team: YAMAMOTO_TEAM, note: "初期研修1年目。記事とオーダは指導医か上級医が確かめる" },
  { name: "指導医 高橋", rank: "指導医", team: YAMAMOTO_TEAM, note: "このチームの指導医" },
  { name: "木下（総合診療科 B）", rank: "医師", team: "総合診療科 B（木下チーム）", note: "ほかのチームの医師（当直のときなど）" },
  { name: "井上（循環器内科）", rank: "医師", team: "循環器内科", note: "コンサルト担当" },
  { name: "放射線科 石田", rank: "医師", team: "放射線科", note: "放射線科医。放射線部で読影レポートを書く" },
  { name: "大野（集中治療科）", rank: "医師", team: "集中治療科", note: "集中治療科。ICU の主治医" },
  { name: "白石（救急科）", rank: "医師", team: "救急科", note: "救急外来の医師" },
  ...["麻酔科 青木", "麻酔科 藤原", "麻酔科 西村"].map(name => ({ name, rank: "医師" as const, team: "麻酔科", note: "術前診察・麻酔管理・術後回診" })),
];

export const DEFAULT_DOCTOR = STAFF.医師.name;

export const doctorOf = (name: string): Doctor | undefined => DOCTORS.find((d) => d.name === name);

export const isResident = (name: string): boolean => doctorOf(name)?.rank === "研修医";

/** The team of a doctor; a doctor not on the list (another department's attending) is a team of one. */
export const teamOf = (name: string): string => doctorOf(name)?.team ?? name;

/** The doctor is the patient's attending, or on the attending's team. */
export const onTeamOf = (name: string, attending: string): boolean => name === attending || teamOf(name) === teamOf(attending);
