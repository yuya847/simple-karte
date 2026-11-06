import { describe, expect, it } from "vitest";
import { slotsFor, examReservationProblem, firstExamSlot, takenExams, examSlotAvailable, type ExamPerson } from "./exam-slots";
import { emptyImaging, emptyPhysio, toImagingOrder, toPhysioOrder } from "./exams";
import { draftLine } from "./draft-line";
import { bookingsOf } from "./bookings";
import { physioRows } from "./physio-desk";
const today = { y: 2026, m: 11, d: 5 };
describe("検査の予約枠", () => {
  it("部屋・検査ごとの間隔と終了時刻", () => {
    expect(slotsFor("XR1", 1, [], today).slice(0, 2).map((s) => s.time)).toEqual(["08:30", "08:45"]);
    expect(slotsFor("CT1", 1, [], today).at(-1)?.time).toBe("16:30");
    expect(slotsFor("MR1", 1, [], today)[1].time).toBe("09:00");
    expect(slotsFor("PHY-ECG", 1, [], today)[1].time).toBe("08:45");
    for (const kind of ["PHY-UCG", "PHY-ABDUS", "PHY-SPIRO"] as const) expect(slotsFor(kind, 1, [], today)[1].time).toBe("09:00");
    expect(slotsFor("PORT", 1, [], today)).toEqual([]);
    expect(firstExamSlot("PHY-EGD", [], today).time).toBe("09:00");
    expect(slotsFor("PHY-EGD", 1, [], today).map((s) => s.time)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30"]);
  });
  it("土曜午後・日曜・祝日・範囲外は休み、空きがなければ翌営業日", () => {
    expect(slotsFor("XR1", 2, [], today).find((s) => s.time === "12:00")?.status).toBe("休み");
    for (const day of [-1, 3, 18, 57]) expect(slotsFor("CT1", day, [], today).every((s) => s.status === "休み")).toBe(true);
    expect(firstExamSlot("CT1", [], { y: 2026, m: 11, d: 7 }).day).toBe(2);
  });
  it("予約の表示・重複禁止・既定は最初の空き", () => {
    const taken = [{ day: 1, time: "08:30", label: "北村 博・胸部 X 線" }];
    expect(slotsFor("XR1", 1, taken, today)[0]).toMatchObject({ status: "予約あり", label: taken[0].label });
    expect(firstExamSlot("XR1", taken, today).time).toBe("08:45");
    expect(examSlotAvailable("XR1", { day: 1, time: "08:30", priority: "予約" }, taken, today)).toBe(false);
    expect(examSlotAvailable("PORT", { day: 1, time: "25:00", priority: "予約" }, [], today)).toBe(false);
  });
  it("全患者の有効オーダと技師の割り当てを重複なく集める", () => {
    const people: ExamPerson[] = [{ patient: { id: "p", name: "北村 博" }, entries: [
      { kind: "order", id: "i", day: 0, time: "09:00", author: "医師", status: "有効", order: { type: "imaging", modality: "X線", region: "R-CHEST", purpose: "確認", when: { day: 1, time: "08:30", priority: "予約" }, transport: "車椅子" } },
      { kind: "order", id: "p", day: 0, time: "09:00", author: "医師", status: "有効", order: { type: "physio", test: "PHY-ECG", purpose: "確認", when: { day: 5, time: "09:00", priority: "予約" }, place: "検査室" } },
    ] }];
    const desk = { i: { orderId: "i", patientId: "p", label: "胸部 X 線", room: "XR1" as const, slot: { day: 5, time: "10:00" } } };
    expect(takenExams(people, "XR1", desk)).toHaveLength(1);
    expect(takenExams(people, "XR1", desk)[0]).toMatchObject({ day: 5, time: "10:00" });
    expect(takenExams(people, "CT1", desk)).toEqual([]);
    expect(takenExams(people, "PHY-ECG")).toHaveLength(1);
    expect(physioRows(people.map((p) => ({ ...p, room: "病棟" })), {})).toHaveLength(1);
    people[0].entries[0].status = "中止";
    expect(takenExams(people, "XR1", desk)).toEqual([]);
  });
});

it("選択日時は下書き・確定オーダ・患者予約にそのまま渡る", () => {
  const when = { day: 10, time: "10:30", priority: "予約" as const };
  const drafts = [{ ...emptyImaging("i", "X線"), region: "R-CHEST", when }, { ...emptyPhysio("p", "PHY-ECG"), when }];
  const ctx = { activeOrders: [], labOrders: [], drafts: [], nowTime: "10:00", fmtDay: (day: number) => `${day}日後`, describe: () => "" };
  for (const d of drafts) {
    expect(draftLine(d, ctx)).toContain("10:30");
    const order = d.kind === "imaging" ? toImagingOrder(d) : toPhysioOrder(d);
    expect(order.when).toEqual(when);
    const entries: import("./types").OrderEntry[] = [{ kind: "order", id: d.id, day: 0, time: "09:00", author: "医師", status: "有効", order }];
    expect(bookingsOf(entries, [], today, 0)[0]).toMatchObject({ day: 10, time: "10:30" });
  }
});

it("確定時にも別の患者と同時の下書きの重複を止める", () => {
  const d = { ...emptyImaging("a", "X線"), when: { day: 1, time: "08:30", priority: "予約" as const } };
  expect(examReservationProblem([d, { ...d, id: "b" }], [], {})).toContain("ほかの下書き");
  expect(examReservationProblem([d], [], { x: { orderId: "x", patientId: "other", label: "胸部 X 線", room: "XR1", slot: { day: 1, time: "08:30" } } })).toContain("予約が重なっています");
  expect(examReservationProblem([d], [], {})).toBeNull();
  expect(examReservationProblem([{ ...d, modality: "ポータブルX線" }, { ...d, id: "b", modality: "ポータブルX線" }], [], {})).toBeNull();
});

it("画像検査は今日から予約枠を探せる", () => {
  const date = { y: 2026, m: 11, d: 6 };
  expect(firstExamSlot("XR1", [], date, 0)).toMatchObject({ day: 0, time: "08:30" });
  expect(firstExamSlot("PORT", [], date, 0).day).toBe(0);
});
