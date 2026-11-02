// FICTIONAL oral prescriptions for the four demo patients (持参薬 = drugs brought from home).

import type { OrderEntry, PrescriptionOrder } from "./types";

const DOCTOR = "山本（専攻医）";

const rx = (
  id: string,
  day: number,
  time: string,
  order: Omit<PrescriptionOrder, "type">,
  extra: Partial<Pick<OrderEntry, "status" | "stoppedOn">> = {},
): OrderEntry => ({ kind: "order", id, day, time, author: DOCTOR, status: "有効", ...extra, order: { type: "prescription", ...order } });

export const PRESCRIPTIONS: Record<string, OrderEntry[]> = {
  // 佐倉 修
  "90010231": [
    rx("sakura-amlo", -3, "17:00", { category: "持参薬", drugCode: "ORAL-AMLO5", amount: 1, unit: "錠", timings: ["朝"], start: { day: -2, timing: "朝" } }),
    rx("sakura-lpz", -3, "17:00", { category: "持参薬", drugCode: "ORAL-LPZ15", amount: 1, unit: "錠", timings: ["朝"], start: { day: -2, timing: "朝" } }),
    rx("sakura-apap", -3, "14:40", {
      category: "臨時",
      drugCode: "ORAL-APAP500",
      amount: 1,
      unit: "錠",
      timings: [],
      prn: "発熱時（38.5℃以上）",
      maxPerDay: 3,
      start: { day: -3 },
      prnUses: [
        { day: -3, time: "20:15" },
        { day: -2, time: "14:20" },
      ],
    }),
  ],
  // 大浦 トメ：絶食のため持参薬は休薬
  "90010244": [
    rx(
      "oura-dnp",
      -1,
      "12:00",
      { category: "持参薬", drugCode: "ORAL-DNP5", amount: 1, unit: "錠", timings: ["朝"], start: { day: 0, timing: "朝" }, comment: "絶食のため休薬" },
      { status: "中止", stoppedOn: -1 },
    ),
    rx(
      "oura-lpz",
      -1,
      "12:00",
      { category: "持参薬", drugCode: "ORAL-LPZ15", amount: 1, unit: "錠", timings: ["朝"], start: { day: 0, timing: "朝" }, comment: "絶食のため休薬" },
      { status: "中止", stoppedOn: -1 },
    ),
  ],
  // 北村 博
  "90010198": [
    rx("kita-ena", -5, "16:00", { category: "持参薬", drugCode: "ORAL-ENA5", amount: 1, unit: "錠", timings: ["朝"], start: { day: -4, timing: "朝" } }),
    rx("kita-biso", -5, "16:00", { category: "持参薬", drugCode: "ORAL-BISO25", amount: 1, unit: "錠", timings: ["朝"], start: { day: -4, timing: "朝" } }),
    rx("kita-spl", -5, "16:00", { category: "持参薬", drugCode: "ORAL-SPL25", amount: 1, unit: "錠", timings: ["朝"], start: { day: -4, timing: "朝" } }),
    rx("kita-mgo", -3, "10:00", {
      category: "定期",
      drugCode: "ORAL-MGO330",
      amount: 1,
      unit: "錠",
      timings: ["朝", "夕"],
      start: { day: -3, timing: "夕" },
      days: 7,
    }),
  ],
  // 森 久美子
  "90010260": [
    rx("mori-rosu", -1, "10:30", { category: "持参薬", drugCode: "ORAL-ROSU25", amount: 1, unit: "錠", timings: ["夕"], start: { day: -1, timing: "夕" } }),
    rx("mori-apap", -2, "20:30", {
      category: "臨時",
      drugCode: "ORAL-APAP500",
      amount: 1,
      unit: "錠",
      timings: [],
      prn: "発熱時（38.5℃以上）",
      maxPerDay: 3,
      start: { day: -2 },
      prnUses: [
        { day: -2, time: "21:00" },
        { day: -1, time: "06:30" },
      ],
    }),
  ],
};
