import { describe, expect, it } from "vitest";
import { readDisplay, readPerson, displayKey } from "./display-state";
import { STAFF } from "./roles";
describe("端末の利用者と表示", () => {
  it("既知の職員・選択可能な医師だけ復元する", () => {
    for (const person of [...Object.values(STAFF), { role: "医師", name: "研修医 田中" }]) expect(readPerson(JSON.stringify(person))).toEqual(person);
    for (const raw of [null, "{", "null", '[]', '{"role":"不明"}', '{"role":"看護師","name":"不明"}']) expect(readPerson(raw)).toEqual(STAFF.医師);
    expect(readPerson('{"role":"医師","name":"不明"}')).toEqual(STAFF.医師);
  });
  it("患者一覧・選択中・場所を戻し、不明な患者と不正な選択を捨てる", () => {
    const state = { area: "er", wardTabs: ["all"], wardTab: "all", patientTabs: [{ id: "p1", owner: "ward:all" }, { id: "p2", owner: "er" }, { id: "gone", owner: "er" }, { id: "p1", owner: "ward:all" }], front: { "ward:all": "p1", er: "p2", opd: "gone" } };
    expect(readDisplay(JSON.stringify(state), "医師", new Set(["p1", "p2"]))).toEqual({ ...state, patientTabs: state.patientTabs.slice(0, 2), front: { "ward:all": "p1", er: "p2" } });
    expect(readDisplay(JSON.stringify(state), "医師", new Set()).patientTabs).toEqual([]);
  });
  it("職種で分け、権限外の場所・画面と壊れた値は既定にする", () => {
    expect(displayKey("医師")).not.toBe(displayKey("看護師"));
    const state = readDisplay('{"area":"er","wardTabs":["cosign",123,"all"],"wardTab":"cosign","patientTabs":[null,{"id":"p","owner":"ward:cosign"}],"front":{"ward:cosign":"p"}}', "薬剤師", new Set(["p"]));
    expect(state.area).toBe("pharmacy"); expect(state.wardTabs).toEqual(["all"]); expect(state.patientTabs).toEqual([]); expect(state.front).toEqual({});
    expect(readDisplay("{", "看護師", new Set()).wardTab).toBe("sheet");
  });
});

it("臨床検査技師は前回が生理検査室でも検査室から始める", () => {
  expect(readDisplay(JSON.stringify({ area: "physio" }), "臨床検査技師", new Set()).area).toBe("lab");
});
