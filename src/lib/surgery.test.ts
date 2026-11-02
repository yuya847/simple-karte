import { describe, expect, it } from "vitest";
import { checkRequest, initialSurgeries, l008Category, l008Fee, overlaps, type Surgery } from "./surgery";

const now = 7 * 60; // today 07:00
const all = initialSurgeries(now);
const req = (o: Partial<Surgery>): Surgery => ({ ...all[2], id: "new", status: "申込", kind: "予定", ...o });

describe("手術申込の確認（コード）", () => {
  it("same room, overlapping with the turnover → stop", () => {
    // 手術室1 today: 08:45–10:45 (+30), 13:30–15:00 (+30)
    const x = req({ day: 0, room: "手術室1", start: "11:00", minutes: 60, kind: "緊急" });
    expect(overlaps(all, x).map((y) => y.id)).toEqual(["or-1"]);
    expect(checkRequest(all, x, now).some((c) => c.level === "stop")).toBe(true);
    expect(overlaps(all, { ...x, start: "11:15" })).toEqual([]);
  });
  it("missing items are asked", () => {
    const x = req({ day: 1, room: "手術室3", start: "13:30", minutes: 60, side: null, position: null });
    expect(checkRequest(all, x, now).find((c) => c.level === "ask")?.text).toBe("左右・体位が抜けています。");
  });
  it("予定 for tomorrow after today 15:00 → past the deadline (締切後)", () => {
    const x = req({ day: 1, room: "手術室3", start: "13:30", minutes: 60 });
    expect(checkRequest(all, x, now).some((c) => c.key === "deadline")).toBe(false);
    expect(checkRequest(all, x, 16 * 60).some((c) => c.key === "deadline")).toBe(true);
  });
});

describe("L008 全身麻酔（令和8年度）", () => {
  it("区分 from the facts: 伏臥位 → 3, 腹腔鏡・側臥位 → 4, その他 → 5", () => {
    expect(l008Category(req({ position: "伏臥位" })).cat).toBe(3);
    expect(l008Category(req({ laparoscopic: true })).cat).toBe(4);
    expect(l008Category(req({ position: "仰臥位" })).cat).toBe(5);
  });
  it("2時間まで基本、超えたら30分（端数を含む）ごと", () => {
    const x = req({ anesthesia: "全身麻酔", laparoscopic: true, record: { anesStart: 500, anesEnd: 500 + 151 } });
    // 4 ロ 6,500 + 650 × ceil(31/30)=2 → 7,800
    expect(l008Fee(x)?.points).toBe(7800);
    expect(l008Fee({ ...x, difficult: true })?.points).toBe(9015 + 1300);
    expect(l008Fee({ ...x, record: { anesStart: 500, anesEnd: 620 } })?.points).toBe(6500);
  });
  it("not for spinal anaesthesia", () => {
    expect(l008Fee(req({ anesthesia: "脊椎麻酔", record: { anesStart: 0, anesEnd: 100 } }))).toBeNull();
  });
});
