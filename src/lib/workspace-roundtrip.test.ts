import { expect, it } from "vitest";
import { decodeWorkspace, encodeWorkspace } from "./workspace-codec";
import { mergeWorkspace } from "./merge-workspace";

import { registeredKeys } from "./workspace-test-keys";
const keys = registeredKeys();
it("全保存対象のキーを登録から取得する", () => {
  expect(keys.length).toBeGreaterThan(100);
  expect(keys).toEqual(expect.arrayContaining(["teamDesk", "kitchenDesk", "rehab", "ris", "audit"]));
});
for (const key of keys) it(`${key}: 種の既存値を変更して差分保存・復元・マージしても残る`, () => {
  for (const [before, after] of [
    [[{ id: "seed", text: "before", checked: false }], [{ id: "seed", text: "after", checked: true }]],
    [{ patient: [{ id: "seed", text: "before" }] }, { patient: [{ id: "seed", text: "after" }] }],
    [{ requests: [{ id: "seed", nextRound: {day:0,time:"10:00"} }], rounds: [] }, { requests: [{ id: "seed" }], rounds: [{id:"round",assessment:"所見",recs:[{id:"rec",text:"提案"}]}] }],
    [{ received: { seed: {by:"before",time:"09:00"} } }, { received: { seed: {by:"高橋",time:"09:38"} } }],
    [{ patient: "before" }, { patient: "after" }],
  ]) {
    const seed = {[key]:before}, edited = {[key]:after};
    const saved = mergeWorkspace(edited, seed, seed).data;
    const wire = JSON.parse(JSON.stringify(encodeWorkspace(saved, seed)));
    const loaded = decodeWorkspace(wire, seed);
    expect(mergeWorkspace(seed, loaded, seed).data).toEqual(edited);
  }
});
