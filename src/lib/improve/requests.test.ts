import { describe, expect, it } from "vitest";
import { PATIENTS } from "../patients";
import { advance, fixedFor, fixedTodo, fixSeen, mineOf, newRequest, readImproveRequests, requestOfCommit, screenLabel, workspaceArg, type ImproveRequest } from "./requests";

const now = new Date("2026-11-07T15:12:00.000Z");
const p = PATIENTS[0];
const base = (over: Partial<ImproveRequest> = {}): ImproveRequest => ({ id: "r1", by: "看護師 佐藤", role: "看護師", iso: now.toISOString(), screen: "病棟 › 入院患者一覧", text: "体温の欄を大きく", status: "受付", ...over });

describe("その場で直す：要望の形", () => {
  it("送る前に名前・番号・電話・日付を置き換え、空なら作らない", () => {
    const r = newRequest({ id: "a", by: "看護師 佐藤", role: "看護師", screen: "病棟 › 入院患者一覧", text: ` ${p.name}さん（${p.id}）の 090-1234-5678 と 11月7日 の欄が狭い `, now })!;
    expect(r).toMatchObject({ id: "a", role: "看護師", status: "受付", iso: now.toISOString(), screen: "病棟 › 入院患者一覧" });
    for (const s of [p.name, p.id, "090-1234-5678", "11月7日"]) expect(r.text).not.toContain(s);
    expect(r.text).toContain("［氏名］");
    expect(r.text).toContain("［電話］");
    expect(newRequest({ id: "b", by: "x", role: "医師", screen: "", text: "   ", now })).toBeNull();
    expect(newRequest({ id: "c", by: "x", role: "医師", screen: "", text: "あ".repeat(900), now })!.text).toHaveLength(500);
  });
  it("保存の形を読み、壊れたものは落とす", () => {
    const ok = base({ status: "直った", commit: "ABCDEF1", note: "直しました", doneIso: now.toISOString(), seen: true });
    expect(readImproveRequests([ok, { id: "x" }, null, "s", { ...base({ id: "y" }), status: "謎" }, { ...base({ id: "z" }), commit: "zzz" }])).toEqual([
      { ...ok, commit: "abcdef1" },
      base({ id: "z" }),
    ]);
    expect(readImproveRequests(undefined)).toEqual([]);
  });
  it("状態は受付→作業中→直った。直ったにはコミットが要り、直ったものを作業中には戻さない", () => {
    const working = advance(base(), { status: "作業中" }, now);
    expect(working.status).toBe("作業中");
    expect(() => advance(working, { note: "x" }, now)).toThrow("コミット");
    expect(() => advance(working, { commit: "xyz" }, now)).toThrow("コミット");
    const done = advance(working, { commit: "ABCDEF1", note: `${p.name}さんの欄を直した` }, now);
    expect(done).toMatchObject({ status: "直った", commit: "abcdef1", doneIso: now.toISOString() });
    expect(done.note).not.toContain(p.name);
    expect(() => advance(done, { status: "作業中" }, now)).toThrow("もう直って");
    // Fixed again: a new commit, shown again, without the last word.
    const again = advance({ ...done, seen: true }, { commit: "1234567" }, now);
    expect(again).toMatchObject({ commit: "1234567", status: "直った" });
    expect(again.seen).toBeUndefined();
    expect(again.note).toBeUndefined();
  });
  it("直りました：送った人だけ、読むまで。押すと消える", () => {
    const list = [base(), base({ id: "f", status: "直った", commit: "abcdef1", note: "広げました", doneIso: "2026-11-07T16:00:00.000Z", text: "体温の欄をもっと大きくして、遠くからでも見やすくしてほしい" }), base({ id: "g", by: "医師 山本", status: "直った", commit: "1234567" })];
    expect(fixedFor(list, "看護師 佐藤").map((r) => r.id)).toEqual(["f"]);
    expect(fixedTodo(fixedFor(list, "看護師 佐藤")[0])).toEqual({ key: "improve-f", label: "直りました：体温の欄をもっと大きくして、遠くからでも見やすく…", detail: "abcdef1、広げました", count: 1, tone: "ai" });
    expect(fixedFor(fixSeen(list, "f"), "看護師 佐藤")).toEqual([]);
    expect(mineOf(list, "看護師 佐藤").map((r) => r.id)).toEqual(["r1", "f"]);
  });
  it("コミットから要望を見つける（短い形でも）", () => {
    const list = [base({ id: "f", status: "直った", commit: "abcdef1" })];
    expect(requestOfCommit(list, "ABCDEF1234567890")?.id).toBe("f");
    expect(requestOfCommit(list, "abcdef2000")).toBeUndefined();
  });
  it("画面の名前：場所・病棟の画面・カルテの道具。患者は入れない", () => {
    expect(screenLabel("all")).toBe("病棟 › 入院患者一覧");
    expect(screenLabel("wardmenu")).toBe("病棟 › 画面を選ぶ");
    expect(screenLabel("er")).toBe("救急外来");
    expect(screenLabel("chart", "add-rx")).toBe("患者のカルテ › 処方");
    expect(screenLabel("chart", "flowsheet")).toBe("患者のカルテ › 経過表");
    expect(screenLabel("visit", "unknown")).toBe("受診のカルテ");
    expect(screenLabel("map", "add-rx")).toBe("病棟 › 病棟マップ");
  });
  it("workspace は id か「ほかの端末で開くリンク」", () => {
    const id = "0f8f5d2e-1c3b-4a5d-9e7f-123456789abc";
    expect(workspaceArg(id)).toBe(id);
    expect(workspaceArg(` https://simple-karte.vercel.app/?ws=${id} `)).toBe(id);
    expect(workspaceArg(`https://simple-karte.vercel.app/?scenarios=100&scenarioWs=${id}`)).toBeNull();
    expect(workspaceArg("abc")).toBeNull();
  });
});
