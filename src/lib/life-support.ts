import type { DischargeSupport } from "./admit-eval";
import { daysFrom, type CalendarDate } from "./dates";

export const LIFE_FIELDS = [
  ["careLevel", "介護保険の区分"], ["application", "申請状況"], ["careManager", "ケアマネ"],
  ["programs", "制度（障害・難病・生活保護など）"], ["housing", "住まい"], ["family", "家族"],
  ["keyPerson", "キーパーソン"], ["contact", "相談先"], ["owner", "担当"],
  ["due", "次回確認日"], ["lastContact", "最終連絡日"], ["nextAction", "次の行動"],
] as const;
export type LifeSupport = Partial<Record<typeof LIFE_FIELDS[number][0], string>> & { waiting?: boolean };
export function lifeLines(life?: LifeSupport): string[] {
  return LIFE_FIELDS.flatMap(([key, label]) => life?.[key]?.trim() ? [`${label}：${life[key]!.trim()}`] : []);
}
export const SUPPORT_FILTERS = ["返答待ち", "期限切れ", "退院が近い（3日以内）"] as const;
export function supportTags(life: LifeSupport | undefined, today: string, leaveDay: number | null, discharged = false, waiting = false): string[] {
  if (discharged) return [];
  return [
    (life?.waiting || waiting) && "返答待ち",
    !!life?.due && life.due < today && "期限切れ",
    leaveDay !== null && leaveDay >= 0 && leaveDay <= 3 && "退院が近い（3日以内）",
  ].filter((x): x is string => !!x);
}
export const CONFERENCE_PEOPLE = ["本人", "家族", "主治医", "看護師", "PT", "OT", "ST", "ケアマネ", "訪問看護", "MSW", "施設担当"] as const;
export interface SupportConference { date: string; time: string; people: string[]; agreement: string; nextAction: string; by: string }
export function conferenceText(c: SupportConference): string {
  return `退院前カンファレンス ${c.date} ${c.time}\n参加者：${c.people.join("・")}\n合意事項：${c.agreement}\n次の行動：${c.nextAction}\n記録：${c.by}`;
}
export interface Coordination { pending: string; owner: string; due: string; receipt: "未受領" | "受領済み" | "確認済み" }
export function coordinationText(c: Coordination): string {
  return `確認待ち事項：${c.pending}\n担当：${c.owner}\n期限：${c.due}\n受領：${c.receipt}`;
}

/** 初回の抽出日時は算定用に保持し、最新の評価だけを表示に使う。 */
export function currentScreening(ds?: DischargeSupport): Pick<DischargeSupport, "factors" | "note"> | undefined {
  return ds?.reassessments?.at(-1) ?? ds;
}
export function appendReassessment(ds: DischargeSupport, record: NonNullable<DischargeSupport["reassessments"]>[number]): DischargeSupport {
  return { ...ds, reassessments: [...(ds.reassessments ?? []), { ...record, factors: [...record.factors] }] };
}

export function appendConference(ds: DischargeSupport, c: SupportConference, today: CalendarDate): DischargeSupport {
  const [y, m, d] = c.date.split("-").map(Number);
  return {
    ...ds,
    conferenceAt: ds.conferenceAt ?? { day: daysFrom(today, { y, m, d }), time: c.time, by: c.by },
    conferences: [...(ds.conferences ?? []), { ...c, people: [...c.people] }],
  };
}

/** 生活・制度に未入力の項目は、すでに記録された入院時の情報を表示する。 */
export function lifeWithIntake(life?: LifeSupport, intake?: { careInsurance: string; living: string; family: string; keyPerson: string; careManager: string }): LifeSupport {
  return { careLevel: intake?.careInsurance, housing: intake?.living, family: intake?.family, keyPerson: intake?.keyPerson, careManager: intake?.careManager, ...life };
}
