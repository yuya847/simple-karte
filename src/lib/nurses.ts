import { STAFF } from "./roles";
import { nurseFor } from "./ward";

export interface Nurse { name: string; rooms: string[]; note: string }
export const DEFAULT_NURSE = STAFF.看護師.name;
const rooms = ["ICU", "HCU"].flatMap(unit => Array.from({ length: 8 }, (_, i) => `${unit}${i + 1}`));
export const NURSES: Nurse[] = [
  { name: DEFAULT_NURSE, rooms: [], note: "5階東。山本チームの受け持ち" },
  ...["ICU1", "ICU5", "HCU1", "HCU5"].map(first => ({
    name: nurseFor(first), rooms: rooms.filter(room => nurseFor(room) === nurseFor(first)),
    note: first.startsWith("ICU") ? (first === "ICU1" ? "ICU1〜4の受け持ち" : "ICU5〜8の受け持ち") : (first === "HCU1" ? "HCU1〜4の受け持ち" : "HCU5〜8の受け持ち"),
  })),
];
