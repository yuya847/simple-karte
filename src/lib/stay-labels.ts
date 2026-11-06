// The words of the left record for the kind of chart in front: a stay in the ward (「今回入院」「入院3日目」) or
// a visit of 救急外来・外来 (「今回の受診」「受診当日」). A visit opens in the same chart screen as a ward patient
// (its Patient has admittedOn 0), so the date tree and the day headings choose their words here, not by the stay.
import { patientPlace } from "./patient-place";
import { hospitalDay } from "./dates";
import type { DayOffset, Patient } from "./types";

export type StayKind = "入院" | "受診";

/** A visit's chart has the visit's id: "er:◯" / "opd:◯" (the visit tabs) or a bare 救急外来 id "er-◯". */
export function stayKindOf(patient: Pick<Patient, "id">): StayKind {
  return patientPlace(patient.id) === "ward" ? "入院" : "受診";
}

/** The top of the date tree: 「今回入院 11/1（日）〜」 for a stay, 「今回の受診 11/4（水）」 for a visit (one day). */
export function stayTitle(kind: StayKind): { title: string; dateSuffix: string } {
  return kind === "入院" ? { title: "今回入院", dateSuffix: "〜" } : { title: "今回の受診", dateSuffix: "" };
}

/** The heading of the visits listed under the stay in the date tree. */
export const earlierVisitsTitle = (kind: StayKind) => (kind === "入院" ? "入院前の外来" : "前の受診");

/** The small tag on a day of the date tree: 「今日」, 「3日目」 (stay) or 「2日後」 (visit; the tree lists only today). */
export function treeDayTag(kind: StayKind, admittedOn: DayOffset, day: DayOffset): string {
  if (kind === "入院" && day < admittedOn) return "入院前";
  if (day === 0) return "今日";
  if (kind === "入院") return `${hospitalDay(admittedOn, day)}日目`;
  return day > 0 ? `${day}日後` : `${-day}日前`;
}

/**
 * The words after the date in a day heading of the record: 「入院3日目（今日）」「入院11日目（予定）」「入院前」
 * for a stay; 「受診当日（今日）」「受診の1日後（予定）」「14日前の受診」 for a visit. `earlier` is a visit listed
 * under the stay (its own clinic), `future` a day ahead with only plans.
 */
export function dayHeading(kind: StayKind, admittedOn: DayOffset, day: DayOffset, opts: { earlier?: boolean; future?: boolean } = {}): string {
  const back = admittedOn - day;
  if (kind === "入院" && day < admittedOn) return "入院前";
  if (opts.earlier) return kind === "入院" ? "入院前" : `${back}日前の受診`;
  const mark = day === 0 ? "（今日）" : opts.future ? "（予定）" : "";
  if (kind === "入院") return `入院${hospitalDay(admittedOn, day)}日目${mark}`;
  if (day === 0) return `受診当日${mark}`;
  return day > 0 ? `受診の${day}日後${mark}` : `受診の${-day}日前${mark}`;
}
