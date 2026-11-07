import { describe, expect, it } from "vitest";
import { mergeWorkspace } from "../merge-workspace";
import { confirmEntry, labsAgreed, pendingIntakes, readInbox, type PortalInboxEntry } from "./inbox";

const e = (x: Partial<PortalInboxEntry>): PortalInboxEntry => ({ id: "a", patientId: "90010244", kind: "intake", at: { day: 0, time: "10:00" }, iso: "2026-11-07T01:00:00.000Z", via: "スマートフォン", ...x });

describe("患者さんの入力の受け箱", () => {
  it("保存されたものを形を確かめて読む", () => {
    const got = readInbox([e({ answers: { living: "独居", bogus: 1 } as never }), { id: 3 }, null, e({ id: "b", kind: "labs", agree: "yes" as never })]);
    expect(got).toHaveLength(2);
    expect(got[0].answers).toEqual({ living: "独居" });
    expect(got[1].agree).toBe(false);
    expect(readInbox("x")).toEqual([]);
  });

  it("検査の結果を見るかは最後の答え", () => {
    const box = [e({ id: "1", kind: "labs", agree: true, iso: "2026-11-07T01:00:00Z" }), e({ id: "2", kind: "labs", agree: false, iso: "2026-11-07T02:00:00Z" }), e({ id: "3", kind: "labs", agree: true, patientId: "other", iso: "2026-11-07T03:00:00Z" })];
    expect(labsAgreed(box, "90010244").agree).toBe(false);
    expect(labsAgreed([box[1], box[0]], "90010244").agree).toBe(false);
    expect(labsAgreed(box, "other").agree).toBe(true);
    expect(labsAgreed(box, "nobody").agree).toBe(false);
  });

  it("確定していない答えだけが残り、確定は誰がいつ", () => {
    const box = [e({ id: "1" }), e({ id: "2", patientId: "x" })];
    expect(pendingIntakes(box, "90010244").map((x) => x.id)).toEqual(["1"]);
    const done = confirmEntry(box, "1", "看護師 佐藤", { day: 0, time: "11:00" }, true);
    expect(done[0].done).toEqual({ by: "看護師 佐藤", at: { day: 0, time: "11:00" }, edited: true });
    expect(pendingIntakes(done).map((x) => x.id)).toEqual(["2"]);
    expect(confirmEntry(done, "1", "別の人", { day: 0, time: "12:00" }, false)[0].done?.by).toBe("看護師 佐藤");
  });

  it("病棟の確定とサーバーが足した入力は、保存のときに両方残る", () => {
    const base = { portalInbox: [e({ id: "1" })], notes: { x: 1 } };
    const ward = { portalInbox: confirmEntry(base.portalInbox, "1", "看護師 佐藤", { day: 0, time: "11:00" }, false), notes: { x: 1 } };
    // The server (patient's page) adds only its entry to the saved row; the other records stay as saved.
    const saved = mergeWorkspace({ portalInbox: [e({ id: "2", iso: "2026-11-07T02:00:00Z" })] }, base, null).data;
    expect(saved.notes).toEqual({ x: 1 });
    const merged = readInbox(mergeWorkspace(ward, saved, base).data.portalInbox);
    expect(merged.map((x) => [x.id, !!x.done])).toEqual([["1", true], ["2", false]]);
  });
});
