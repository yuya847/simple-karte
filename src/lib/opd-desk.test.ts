import { describe, expect, it } from "vitest";
import { OPD_PATIENTS } from "./opd";
import {
  arrive,
  bookToday,
  call,
  callToPay,
  CARDS,
  CLINICS,
  displayBoard,
  isCardNo,
  kiosk,
  newCardNo,
  nextTicket,
  OTHER_DEPT_TODAY,
  queueOf,
  receive,
  slotsFor,
  slotTimes,
  tickets,
} from "./opd-desk";

const today = [...OPD_PATIENTS, ...OTHER_DEPT_TODAY];
const yamamoto = CLINICS[0];

describe("受付番号", () => {
  it("numbers today's arrivals in the order they came, and gives the next one at reception", () => {
    const t = tickets(OPD_PATIENTS);
    // 中谷 08:30, 石田 08:42, 原田 09:05, 吉村 09:20
    expect(["opd-6", "opd-1", "opd-2", "opd-3"].map((id) => t.get(id))).toEqual([1, 2, 3, 4]);
    const next = arrive(OPD_PATIENTS, "opd-5", "10:01");
    expect(next.find((p) => p.id === "opd-5")).toMatchObject({ arrived: "10:01", status: "受付済", ticket: 5 });
    expect(arrive(next, "opd-5", "10:30")).toBe(next);
    expect(nextTicket(next)).toBe(6);
  });
  it("receives a new 初診 with a new 診察券 and the 紹介元 from the master", () => {
    const card = { cardNo: newCardNo(CARDS), name: "架空 花子", kana: "カクウ ハナコ", sex: "女" as const, age: 40 };
    expect(card.cardNo).toBe("1000113");
    const list = receive(OPD_PATIENTS, { id: "n1", card, kind: "初診", dept: "総合診療科", doctor: yamamoto.doctor, reason: "咳", referral: { facilityId: "f01", facilityName: "〇〇内科クリニック（架空）" } }, "10:05");
    expect(list.at(-1)).toMatchObject({ kind: "初診", slot: null, status: "受付済", ticket: 5, referralFrom: "f01", cardNo: "1000113" });
    expect(isCardNo("1000113")).toBe(true);
    expect(isCardNo("100011")).toBe(false);
  });
});

describe("予約の枠", () => {
  it("makes the slots from the clinic's hours", () => {
    const times = slotTimes(yamamoto);
    expect(times[0]).toBe("09:00");
    expect(times).toContain("11:45");
    expect(times).not.toContain("12:00");
    expect(times).toContain("14:00");
  });
  it("fills a slot from today's list, the bookings and the 再診予約 of the charts", () => {
    const slots = slotsFor(yamamoto, 0, OPD_PATIENTS, [{ id: "b", day: 0, time: "09:00", dept: "総合診療科", doctor: yamamoto.doctor, name: "予約 太郎", kana: "", kind: "再診", purpose: "", by: "", at: "" }], []);
    expect(slots.find((s) => s.time === "09:00")!.taken.map((x) => x.name)).toEqual(["石田 正男", "予約 太郎"]);
    const later = slotsFor(yamamoto, 7, OPD_PATIENTS, [], [{ day: 7, time: "10:00", name: "石田 正男", doctor: yamamoto.doctor }]);
    expect(later.find((s) => s.time === "10:00")!.taken[0].from).toBe("再診予約（カルテ）");
    expect(later.find((s) => s.time === "09:00")!.taken).toHaveLength(0);
  });
  it("puts today's booking on today's list as 予約", () => {
    const list = bookToday(OPD_PATIENTS, { id: "b", day: 0, time: "11:00", dept: "総合診療科", doctor: yamamoto.doctor, cardNo: "1000111", name: "野田 勝也", kana: "ノダ カツヤ", kind: "再診", purpose: "相談", by: "医事課", at: "10:00" }, CARDS.find((c) => c.cardNo === "1000111"));
    expect(list.at(-1)).toMatchObject({ status: "予約", slot: "11:00", sex: "男", age: 62 });
  });
});

describe("診察の順番と待合の表示", () => {
  it("orders the waiting by the 予約 time, else the reception time", () => {
    // 原田 09:15 予約・09:05 受付, 吉村 予約外・09:20 受付
    expect(queueOf(OPD_PATIENTS, yamamoto.doctor).map((p) => p.name)).toEqual(["原田 恵子", "吉村 拓也"]);
  });
  it("shows numbers only: 診察中, お呼びしている, 次, and 会計", () => {
    const called = callToPay(call(today, "opd-3", "09:40", "看護師"), "opd-6", "09:41", "医事課");
    const b = displayBoard(called, 3);
    const room = b.rooms.find((r) => r.room === "診察室1")!;
    // Numbers by arrival over all departments: 中谷 1, 石田 2, 松井 3, 原田 4, 大西 5, 吉村 6.
    expect(room.now).toEqual([2]);
    expect(room.calling).toEqual([6]);
    expect(room.next).toEqual([4]);
    expect(b.rooms.find((r) => r.room === "診察室8")!.now).toEqual([3]);
    expect(b.pay).toEqual({ calling: [1], preparing: [] });
    expect(JSON.stringify(b)).not.toContain("石田");
    // 木下 has no clinic on Tuesday; 森 does.
    expect(displayBoard(today, 2).rooms.map((r) => r.room)).not.toContain("診察室2");
  });
});

describe("再来受付機（模擬）", () => {
  it("receives today's 予約 by the 診察券番号", () => {
    const r = kiosk(today, CARDS, "1000105", "09:50");
    expect(r.result.kind).toBe("受付しました");
    expect(r.list.find((p) => p.id === "opd-5")).toMatchObject({ status: "受付済", arrived: "09:50" });
    expect(kiosk(r.list, CARDS, "1000105", "09:55").result.kind).toBe("受付済み");
  });
  it("sends the others to the window", () => {
    expect(kiosk(today, CARDS, "1000111", "09:50").result.kind).toBe("今日の予約がありません");
    expect(kiosk(today, CARDS, "9999999", "09:50").result.kind).toBe("番号が違います");
  });
});
