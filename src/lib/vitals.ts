// FICTIONAL vital signs and daily nursing records for the four demo patients.
// Values are made up to match the notes in patients.ts (e.g. the day-2 note says
// "BT 38.2℃、HR 96", so the morning reading that day is 38.2 / 96).

import type { DailyRecord, VitalSign } from "./types";

type Row = [day: number, time: string, bt: number, hr: number, sbp: number, dbp: number, rr: number, spo2: number, o2?: string];

const rows = (list: Row[]): VitalSign[] =>
  list.map(([day, time, bt, hr, sbp, dbp, rr, spo2, o2]) => ({ day, time, bt, hr, sbp, dbp, rr, spo2, o2: o2 ?? "室内気" }));

export const VITALS: Record<string, VitalSign[]> = {
  // 佐倉 修：右下腿蜂窩織炎 → MRSA 菌血症
  "90010231": rows([
    [-3, "14:20", 38.9, 104, 128, 74, 20, 96],
    [-3, "20:00", 39.2, 108, 118, 66, 22, 95],
    [-2, "06:00", 38.2, 96, 126, 72, 20, 96],
    [-2, "14:00", 38.6, 100, 120, 68, 20, 96],
    [-2, "20:00", 38.0, 94, 122, 70, 18, 96],
    [-1, "06:00", 37.8, 90, 124, 72, 18, 97],
    [-1, "14:00", 38.1, 92, 126, 74, 18, 97],
    [-1, "20:00", 37.7, 88, 122, 70, 18, 97],
    [0, "07:00", 37.6, 88, 122, 70, 16, 97],
  ]),
  // 大浦 トメ：誤嚥性肺炎
  "90010244": rows([
    [-1, "11:30", 38.3, 102, 138, 76, 24, 92],
    [-1, "14:00", 38.6, 104, 132, 70, 24, 96, "鼻カニュラ 2L"],
    [-1, "20:00", 38.1, 98, 128, 72, 22, 95, "鼻カニュラ 2L"],
    [0, "06:30", 37.9, 92, 130, 74, 20, 95, "鼻カニュラ 1L"],
  ]),
  // 北村 博：慢性心不全の急性増悪
  "90010198": rows([
    [-5, "15:00", 36.8, 98, 156, 88, 24, 91],
    [-5, "20:00", 36.9, 94, 148, 84, 22, 94, "鼻カニュラ 2L"],
    [-4, "06:00", 36.6, 90, 142, 82, 20, 95, "鼻カニュラ 2L"],
    [-4, "14:00", 36.7, 88, 138, 80, 20, 95, "鼻カニュラ 2L"],
    [-4, "20:00", 36.8, 86, 136, 78, 18, 96, "鼻カニュラ 1L"],
    [-3, "06:00", 36.5, 84, 134, 78, 18, 96, "鼻カニュラ 1L"],
    [-3, "14:00", 36.7, 82, 132, 76, 18, 96, "鼻カニュラ 1L"],
    [-3, "20:00", 36.6, 80, 130, 76, 18, 97],
    [-2, "06:00", 36.5, 78, 128, 74, 16, 96],
    [-2, "14:00", 36.6, 80, 130, 76, 16, 96],
    [-2, "20:00", 36.5, 78, 126, 72, 16, 97],
    [-1, "06:00", 36.4, 76, 124, 72, 16, 96],
    [-1, "14:00", 36.6, 78, 126, 74, 16, 97],
    [-1, "20:00", 36.5, 76, 122, 70, 16, 97],
    [0, "06:00", 36.4, 74, 120, 70, 16, 97],
  ]),
  // 森 久美子：急性腎盂腎炎
  "90010260": rows([
    [-2, "20:10", 39.4, 112, 112, 68, 22, 97],
    [-1, "06:00", 38.1, 98, 116, 70, 20, 97],
    [-1, "14:00", 38.3, 100, 118, 70, 18, 98],
    [-1, "20:00", 37.9, 94, 120, 72, 18, 98],
    [0, "06:00", 37.4, 86, 122, 74, 16, 98],
  ]),
};

export const DAILY: Record<string, DailyRecord[]> = {
  "90010231": [
    { day: -3, meals: [null, null, 5], weightKg: 58.0 },
    { day: -2, meals: [6, 7, 7], urineMl: 1450, stools: 1 },
    { day: -1, meals: [8, 8, 9], urineMl: 1600, stools: 0 },
    { day: 0, meals: [8, null, null], weightKg: 57.8 },
  ],
  "90010244": [
    { day: -1, meals: "絶食", urineMl: 620, stools: 0, weightKg: 41.0 },
    { day: 0, meals: "絶食" },
  ],
  "90010198": [
    { day: -5, meals: [null, null, 5], urineMl: 900, weightKg: 67.0 },
    { day: -4, meals: [7, 8, 8], urineMl: 2100, stools: 1, weightKg: 66.1 },
    { day: -3, meals: [8, 8, 8], urineMl: 2300, stools: 1, weightKg: 65.0 },
    { day: -2, meals: [8, 9, 8], urineMl: 1900, stools: 0, weightKg: 64.0 },
    { day: -1, meals: [9, 9, 10], urineMl: 1700, stools: 1, weightKg: 63.0 },
    { day: 0, meals: [9, null, null], weightKg: 62.8 },
  ],
  "90010260": [
    { day: -2, meals: [null, null, null], urineMl: 400 },
    { day: -1, meals: [3, 5, 6], urineMl: 1800, stools: 1, weightKg: 55.0 },
    { day: 0, meals: [7, null, null] },
  ],
};
