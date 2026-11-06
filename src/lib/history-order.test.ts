import { describe, expect, it } from "vitest";
import { orderLocked, prescriptionText } from "./history-order";
import type { OrderEntry } from "./types";
const rx: OrderEntry = { kind: "order", id: "rx", day: 0, time: "09:00", author: "医師", status: "有効", order: { type: "prescription", drugCode: "unknown", amount: 1, unit: "錠", category: "定期", timings: ["朝", "昼", "夕"], days: 7, start: { day: 0 } } };
describe("経過の処方操作", () => {
  it("監査前は修正でき、監査または払出後は解除するまでロックする", () => {
    expect(orderLocked("rx", {}, {}, [])).toBe(false);
    expect(orderLocked("rx", { rx: "09:00" }, {}, [])).toBe(true);
    expect(orderLocked("rx", {}, { "rx|540": "09:00" }, [])).toBe(true);
    expect(orderLocked("rx", { rx: "09:00" }, { "rx|540": "09:00" }, ["rx"])).toBe(false);
    expect(orderLocked("r", {}, { "rx|540": "09:00" }, [])).toBe(false);
  });
  it("内服を1薬1行で、量・回数・用法・日数つきにする", () => {
    const text = prescriptionText([rx, { ...rx, id: "rx2" }]);
    expect(text.split("\n")).toHaveLength(2);
    expect(text).toContain("unknown　1回1錠　1日3回");
    expect(text.split("\n")[0]).toMatch(/7日分$/);
  });
  it("注射の配合薬もそれぞれ量・経路・回数を含める", () => {
    const inj: OrderEntry = { ...rx, order: { type: "injection", items: [{ drugCode: "unknown", amount: 2, unit: "mL" }], route: "静注", schedule: { kind: "once" }, days: 1, start: { day: 0 } } };
    expect(prescriptionText([inj])).toContain("unknown　2mL　静注");
    expect(prescriptionText([inj])).toMatch(/1日分$/);
  });
});

import { historyOrderHandlers, unlockReducer } from "./history-order";
import { vi } from "vitest";
it("同じRpの修正は全薬の旧版を中止下書きにして入力へ読み込む", () => {
  const a: OrderEntry = { ...rx, order: { ...rx.order, type: "prescription", drugCode: "a", amount: 1, unit: "錠", category: "定期", timings: ["朝"], start: { day: 0 }, rp: "rp1" } };
  const b = { ...a, id: "b" };
  const stopDraft = vi.fn(); const load = vi.fn();
  const handlers = historyOrderHandlers({ entries: [a, b], locked: () => false, canEdit: true, modifyInjection: vi.fn(), stopDraft, load });
  handlers.modify(a);
  expect(stopDraft.mock.calls.map(call => call[0].id)).toEqual(["rx", "b"]);
  expect(load).toHaveBeenCalledWith(a);
});
it("同じRpにロックがあれば修正・中止を実行しない", () => {
  const stopDraft = vi.fn(); const load = vi.fn();
  const handlers = historyOrderHandlers({ entries: [rx], locked: () => true, canEdit: true, modifyInjection: vi.fn(), stopDraft, load });
  handlers.modify(rx); handlers.stop(rx);
  expect(stopDraft).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled();
});

it("解除依頼は重複せず、薬剤師の解除で依頼を消して医師の修正を可能にする", () => {
  const request = { orderId: "rx", patientId: "p", patientName: "患者", reason: "用量を修正" };
  let state = unlockReducer({ requests: [], released: [] }, { type: "request", request });
  state = unlockReducer(state, { type: "request", request: { ...request, reason: "日数を修正" } });
  expect(state.requests).toHaveLength(1);
  expect(state.requests[0].reason).toBe("日数を修正");
  expect(orderLocked("rx", { rx: "09:00" }, {}, state.released)).toBe(true);
  state = unlockReducer(state, { type: "release", id: "rx" });
  expect(state.requests).toEqual([]);
  expect(orderLocked("rx", { rx: "09:00" }, {}, state.released)).toBe(false);
  state = unlockReducer(state, { type: "relock", id: "rx" });
  expect(orderLocked("rx", { rx: "10:00" }, {}, state.released)).toBe(true);
});
