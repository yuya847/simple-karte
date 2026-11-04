// 実施・未実施 from the order row and the calendar cells: today's occurrences of an order, the record the menu
// writes (実施 now or at a time, 未実施 with a reason), what each occurrence allows, who may, and the badge.
import { describe, expect, it } from "vitest";
import { marKey, type AdminRecord } from "./mar";
import { MENU_NOTE, actionsFor, canHaveExecution, executeDeny, executionBadge, menuRecord, occurrenceAt, occurrenceStates, occurrencesOn, recordText } from "./order-execute";
import { ROLES } from "./roles";
import type { OrderEntry, Patient } from "./types";

const patient = { id: "p1", name: "佐倉 修", room: "512", age: 72, sex: "男" } as never as Patient;
const inj: OrderEntry = {
  kind: "order",
  id: "inj",
  day: -1,
  time: "10:00",
  author: "山本（専攻医）",
  status: "有効",
  order: { type: "injection", items: [{ drugCode: "INJ-CEZ1", amount: 1, unit: "g" }], route: "点滴静注", schedule: { kind: "every_hours", hours: 12 }, start: { day: -1, time: "08:00" }, minutesPerDose: 30 },
};
const rx: OrderEntry = { kind: "order", id: "rx", day: -1, time: "09:00", author: "山本（専攻医）", status: "有効", order: { type: "prescription", category: "定期", drugCode: "ORAL-MET250", amount: 1, unit: "錠", timings: ["朝", "夕"], start: { day: -1, timing: "朝" } } };
const prn: OrderEntry = { kind: "order", id: "prn", day: -1, time: "09:00", author: "山本（専攻医）", status: "有効", order: { type: "prescription", category: "臨時", drugCode: "ORAL-ACE500", amount: 1, unit: "錠", timings: [], prn: "疼痛時", maxPerDay: 3, start: { day: -1 } } };
const lab: OrderEntry = { kind: "order", id: "lab", day: -1, time: "09:00", author: "山本（専攻医）", status: "有効", order: { type: "lab", codes: ["CBC"], collect: { day: 0, time: "06:00" }, priority: "定時" } };
const opd: OrderEntry = { kind: "order", id: "opd", day: 0, time: "09:00", author: "山本（専攻医）", status: "有効", order: { type: "procedure", code: "PROC-OPD", opd: { dept: "皮膚科", day: 3, slot: "午前", purpose: "再診" }, schedule: { kind: "once" }, start: { day: 3 } } };
const noon = 12 * 60;

describe("今日の回", () => {
  it("12時間ごとの注射は今日 08:00 と 20:00 の2回、採血は 06:00 の1回", () => {
    expect(occurrencesOn(patient, inj, 0, noon).timed.map((i) => i.at)).toEqual([480, 1200]);
    const draw = occurrencesOn(patient, lab, 0, noon);
    expect(draw.timed.map((i) => [i.kind, i.at])).toEqual([["採血", 360]]);
    expect(draw.untimed).toBeNull();
  });
  it("内服は病棟の服用時刻（朝 08:00・夕 18:00）、頓用は時刻のない1件", () => {
    expect(occurrencesOn(patient, rx, 0, noon).timed.map((i) => i.at)).toEqual([480, 1080]);
    const p = occurrencesOn(patient, prn, 0, noon);
    expect(p.timed).toEqual([]);
    expect(p.untimed?.kind).toBe("内服");
    expect(p.untimed?.at).toBeNull();
  });
  it("昨日・明日の回も日を変えれば出る。カレンダーのセルの時刻から1回を引ける", () => {
    expect(occurrencesOn(patient, inj, 1, noon).timed.map((i) => i.at)).toEqual([1440 + 480, 1440 + 1200]);
    expect(occurrenceAt(patient, inj, 1200, noon)?.at).toBe(1200);
    expect(occurrenceAt(patient, inj, 1000, noon)).toBeNull();
  });
  it("外来予約・他科依頼などは対象外、退院時処方も", () => {
    expect(canHaveExecution(opd)).toBe(false);
    expect(occurrencesOn(patient, opd, 3, noon).timed).toEqual([]);
    expect(canHaveExecution({ ...rx, order: { ...rx.order, category: "退院時" } } as OrderEntry)).toBe(false);
    expect(canHaveExecution(inj)).toBe(true);
  });
});

describe("回の状態と、できること", () => {
  const items = occurrencesOn(patient, inj, 0, noon).timed;
  const done: AdminRecord = { key: marKey("inj", 480), orderId: "inj", patientId: "p1", at: 480, status: "実施", doneAt: "08:05", by: "看護師 佐藤", checked: { patient: true, label: true } };
  it("記録のある回は 実施、時刻を過ぎた回は 未入力、先の回は 予定、この画面を開く前の回は 記録済み", () => {
    const s = occurrenceStates(items, { [done.key]: done }, 420, noon);
    expect(s.map((o) => [o.time, o.state])).toEqual([
      ["08:00", "実施"],
      ["20:00", "予定"],
    ]);
    expect(s[0].record).toBe(done);
    expect(occurrenceStates(items, {}, 420, noon)[0].state).toBe("未入力");
    expect(occurrenceStates(items, {}, 600, noon)[0].state).toBe("記録済み");
  });
  it("記録のある回は取り消しだけ、未入力・予定の回は記録、記録済み（前の勤務帯）と明日以降は何もできない", () => {
    const s = occurrenceStates(items, { [done.key]: done }, 420, noon);
    expect(actionsFor(s[0])).toEqual({ kind: "void", record: done });
    expect(actionsFor(s[1])).toEqual({ kind: "record" });
    expect(actionsFor(occurrenceStates(items, {}, 600, noon)[0]).kind).toBe("locked");
    const tomorrow = occurrenceStates(occurrencesOn(patient, inj, 1, noon).timed, {}, 420, noon);
    expect(actionsFor(tomorrow[0])).toMatchObject({ kind: "locked", why: expect.stringContaining("明日以降") });
    const older: OrderEntry = { ...inj, day: -3, order: { ...inj.order, start: { day: -3, time: "08:00" } } } as OrderEntry;
    const old = occurrenceStates(occurrencesOn(patient, older, -2, noon).timed, {}, -5000, noon);
    expect(old).toHaveLength(2);
    expect(actionsFor(old[0])).toMatchObject({ kind: "locked", why: expect.stringContaining("今日と昨日") });
  });
});

describe("メニューから書く記録", () => {
  const item = occurrencesOn(patient, inj, 0, noon).timed[0];
  it("実施（いま）: 予定の時刻が鍵、実施の時刻と誰が、照合なしの注記、60分より遅れていればそのずれ。mL のない注射は点滴の開始ではない", () => {
    const r = menuRecord(item, { status: "実施", day: 0, time: "12:00", by: "山本（専攻医）" })!;
    expect(r.key).toBe("inj|480");
    expect(r.status).toBe("実施");
    expect(r.doneAt).toBe("12:00");
    expect(r.by).toBe("山本（専攻医）");
    expect(r.checked).toEqual({ patient: false, label: null });
    expect(r.offBy).toBe(240);
    expect(r.note).toBe(MENU_NOTE);
    expect(r.drip).toBeUndefined();
  });
  it("実施（時刻を選ぶ）: 窓の中なら ずれは記録しない。時刻でない文字なら作らない", () => {
    expect(menuRecord(item, { status: "実施", day: 0, time: "8:20", by: "看護師 佐藤" })).toMatchObject({ doneAt: "08:20", offBy: undefined });
    expect(menuRecord(item, { status: "実施", day: 0, time: "いま", by: "看護師 佐藤" })).toBeNull();
  });
  it("未実施は理由が要る。理由があれば記録に残る", () => {
    expect(menuRecord(item, { status: "未実施", day: 0, time: "12:00", by: "看護師 佐藤" })).toBeNull();
    const r = menuRecord(item, { status: "未実施", day: 0, time: "12:00", by: "看護師 佐藤", reason: "嘔気・嘔吐" })!;
    expect(r.status).toBe("未実施");
    expect(r.reason).toBe("嘔気・嘔吐");
    expect(recordText(r)).toBe("未実施（嘔気・嘔吐） 12:00 看護師 佐藤");
  });
  it("頓用（時刻なし）は、実施した時刻がその回の時刻になる", () => {
    const u = occurrencesOn(patient, prn, 0, noon).untimed!;
    const r = menuRecord(u, { status: "実施", day: 0, time: "10:20", by: "看護師 佐藤" })!;
    expect(r.at).toBe(620);
    expect(r.key).toBe("prn|620");
  });
});

describe("権限", () => {
  it("看護師と医師は記録できる。ほかの職種には理由が返る", () => {
    expect(executeDeny("看護師")).toBeNull();
    expect(executeDeny("医師")).toBeNull();
    for (const r of ROLES.filter((x) => x !== "看護師" && x !== "医師" && x !== "デバッグ")) expect(executeDeny(r)).toContain("与薬・実施の記録は看護師・医師が行います");
  });
});

describe("オーダ行の印", () => {
  const done: AdminRecord = { key: marKey("inj", 480), orderId: "inj", patientId: "p1", at: 480, status: "実施", doneAt: "08:05", by: "看護師 佐藤", checked: { patient: true, label: true } };
  const refused: AdminRecord = { ...done, status: "未実施", reason: "患者が拒否", doneAt: "08:10", checked: { patient: false, label: null } };
  it("記録があれば「実施 08:05」、残りの回があれば「予定 20:00」も", () => {
    const b = executionBadge(patient, inj, { [done.key]: done }, 420, noon)!;
    expect(b.text).toBe("実施 08:05・予定 20:00");
    expect(b.tone).toBe("done");
    expect(b.title).toContain("08:00 実施 08:05 看護師 佐藤");
    expect(b.title).toContain("20:00 予定");
  });
  it("未実施は理由つき、時刻を過ぎて記録がなければ「未入力 08:00」が先", () => {
    expect(executionBadge(patient, inj, { [refused.key]: refused }, 420, noon)).toMatchObject({ text: "未実施（患者が拒否） 08:10・予定 20:00", tone: "not" });
    expect(executionBadge(patient, inj, {}, 420, noon)).toMatchObject({ text: "未入力 08:00・予定 20:00", tone: "late" });
  });
  it("前の勤務帯の分（記録済み）は数えず、予定だけ。今日の回がないオーダは印なし", () => {
    expect(executionBadge(patient, inj, {}, 600, noon)).toMatchObject({ text: "予定 20:00", tone: "plan" });
    expect(executionBadge(patient, opd, {}, 420, noon)).toBeNull();
  });
  it("頓用は今日使った記録を数える（2回なら「実施 2回」）", () => {
    const a: AdminRecord = { key: "prn|600", orderId: "prn", patientId: "p1", at: 600, status: "実施", doneAt: "10:00", by: "看護師 佐藤", checked: { patient: false, label: null } };
    const b: AdminRecord = { ...a, key: "prn|700", at: 700, doneAt: "11:40" };
    expect(executionBadge(patient, prn, { [a.key]: a, [b.key]: b }, 420, noon)).toMatchObject({ text: "実施 2回", tone: "done" });
    expect(executionBadge(patient, prn, {}, 420, noon)).toBeNull();
  });
});
