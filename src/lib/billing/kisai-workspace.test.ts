import { describe, expect, it } from "vitest";
import { decodeWorkspace, encodeWorkspace } from "../workspace-codec";
import { mergeWorkspace } from "../merge-workspace";
import { registeredKeys } from "../workspace-test-keys";
import { kisaiWorkspace, type KisaiWorkspace } from "./kisai-workspace";
import { saveAnswer, saveShoki } from "./kisai-view";
import { currentShoki } from "./shoki";

let n = 0;
const input = { patientId: "p", month: "2026-11", targets: [], category: "03" as const, body: "第1版", by: "医師 試験", at: "2026-11-07T12:00:00+09:00", newId: () => `s${++n}` };
const answer = { patientId: "p", month: "2026-11", claimCode: "190171910", by: "医師 試験", at: "2026-11-07T12:00:00+09:00", reviewedRequirements: true, comments: [{ code: "820100411" }, { code: "831110001", text: "160000310" }] };
const save = (edited: Record<string, unknown>, seed: Record<string, unknown>) => {
  const saved = mergeWorkspace(edited, seed, seed).data;
  return decodeWorkspace(JSON.parse(JSON.stringify(encodeWorkspace(saved, seed))), seed);
};

describe("記載・書類の保存（workspace の kisai）", () => {
  it("WardApp の保存の表にある", () => expect(registeredKeys()).toContain("kisai"));
  it("症状詳記の版と摘要の答えを保存して読み戻すと同じ（下書き・前の版も残る）", () => {
    const v1 = saveShoki(kisaiWorkspace(), input, "確定");
    const k: KisaiWorkspace = saveAnswer(saveShoki(v1, { ...input, series: v1.shoki[0].id, body: "第2版" }, "下書き"), answer);
    const loaded = save({ kisai: k }, {});
    expect(mergeWorkspace({}, loaded, {}).data.kisai).toEqual(k);
    expect(kisaiWorkspace(loaded.kisai as KisaiWorkspace)).toEqual(k);
    expect(currentShoki((loaded.kisai as KisaiWorkspace).shoki).map((s) => s.body)).toEqual(["第1版"]);
  });
  it("二つの端末：一方が詳記を確定し、もう一方が摘要のコメントを選んでも、両方残る", () => {
    const base = { kisai: kisaiWorkspace() };
    const mine = { kisai: saveShoki(kisaiWorkspace(), input, "確定") };
    const theirs = { kisai: saveAnswer(kisaiWorkspace(), answer) };
    const merged = mergeWorkspace(mine, theirs, base).data.kisai as KisaiWorkspace;
    expect(merged.shoki.map((s) => s.body)).toEqual(["第1版"]);
    expect(merged.tekiyoAnswers).toEqual([answer]);
  });
  it("保存のない日・古い保存は空として読む", () => {
    expect(kisaiWorkspace(undefined)).toEqual({ shoki: [], tekiyoAnswers: [] });
    expect(kisaiWorkspace({ shoki: [] })).toEqual({ shoki: [], tekiyoAnswers: [] });
  });
});
