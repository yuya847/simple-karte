import { describe, expect, it } from "vitest";
import { bookingsOf } from "./bookings";
import type { OrderEntry } from "./types";

const today = { y: 2026, m: 11, d: 3 };
const e = (id: string, order: OrderEntry["order"], status: OrderEntry["status"] = "有効"): OrderEntry => ({ kind: "order", id, day: 0, time: "09:00", author: "x", status, order });

describe("予約の一覧", () => {
  it("lists exams, draws, dialysis and operations by day and time, without stopped ones", () => {
    const list = bookingsOf(
      [
        e("ct", { type: "imaging", modality: "CT", region: "R-CHEST", contrast: "単純", when: { day: 1, time: "10:30", priority: "予約" } } as never),
        e("lab", { type: "lab", codes: ["LAB-CBC"], collect: { day: 1, time: "06:00" }, priority: "通常" } as never),
        e("hd", { type: "procedure", code: "PROC-HD", hd: { purpose: "緊急", method: "HD", minutes: 240, qb: 200, membrane: 1.5, anticoag: { drug: "なし", initial: null, hourly: null }, uf: 1, dw: null, access: "AVF（シャント）" }, schedule: { kind: "once" }, start: { day: 2, time: "13:00" } }),
        e("stop", { type: "lab", codes: ["LAB-CRP"], collect: { day: 1, time: "06:00" }, priority: "通常" } as never, "中止"),
      ],
      [{ day: 3, start: "09:00", procedure: "腹腔鏡下胆嚢摘出術" }],
      today,
      600,
    );
    expect(list.map((b) => `${b.day} ${b.time} ${b.kind}`)).toEqual(["1 06:00 採血・検体", "1 10:30 画像", "2 13:00 透析", "3 09:00 手術"]);
  });
});
