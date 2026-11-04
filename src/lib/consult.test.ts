import { describe, it, expect } from "vitest";
import { addressedTo, closeConsult, consultInbox, consultState, quoteConsultSummary, replyConsult, referralDraft, consultNotifications, consultReplyNote } from "./consult";
import { can } from "./roles";
import type { OrderEntry, Patient } from "./types";
const order = (id: string, day = 0, doctor = ""): OrderEntry => ({ kind: "order", id, day, time: "10:00", author: "山本（専攻医）", role: "医師", status: "有効", order: { type: "procedure", schedule: { kind: "once" }, start: { day: 0 }, code: "PROC-CONSULT", consult: { dept: "循環器内科", doctor, urgency: "本日中", question: "質問" } } } as OrderEntry);
const patient = { id: "p", sex: "男", labs: [], imaging: [] } as unknown as Patient;
describe("コンサルト", () => {
    it("科の当番と指名を区別する", () => { expect(addressedTo(order("1"), "井上（循環器内科）")).toBe(true); expect(addressedTo(order("1", 0, "別の医師"), "井上（循環器内科）")).toBe(false); expect(addressedTo(order("1"), "山本（専攻医）")).toBe(false); });
    it("古い順で状態を組み立て、終了を保つ", () => { const reply = { text: "所見", by: "井上（循環器内科）", at: "11:00" }; expect(consultState()).toBe("依頼中"); expect(consultState(reply)).toBe("返答あり"); expect(consultState(closeConsult(reply))).toBe("終了"); expect(closeConsult(reply).text).toBe("所見"); expect(consultInbox([{ patient, entries: [order("new"), order("old", -1)] }], "井上（循環器内科）", {}).map(x => x.entry.id)).toEqual(["old", "new"]); });
    it("最新の記事の A/P と最新画像をコピーする", () => { const p = { ...patient, imaging: [{ day: 0, time: "10:00", report: "画像本文", region: "胸部", modality: "CT" }] } as Patient; const text = quoteConsultSummary(p, [{ kind: "note", day: 0, time: "09:00", author: "医師", role: "医師", soap: { s: "引用しない", a: "評価本文", p: "計画本文" } }]); expect(text).toContain("A) 評価本文"); expect(text).toContain("P) 計画本文"); expect(text).toContain("画像本文"); expect(text).not.toContain("引用しない"); });
    it("返書の二重確定と終了後の変更を防ぐ", () => { const r = replyConsult(undefined, "  所見  ", "井上", "11:00"); expect(r.text).toBe("所見"); expect(replyConsult(r, "別文", "井上", "12:00")).toBe(r); const closed = closeConsult(r); expect(replyConsult(closed, "別文", "井上", "12:00")).toBe(closed); });
    it("紹介状へ宛先と編集した引用を引き継ぐ", () => { const d = referralDraft("p", "架空病院", "循環器内科", "精査", "編集した経過"); expect(d.letter.to).toBe("架空病院"); expect(d.sections.course).toBe("編集した経過"); });
    it("返書通知は依頼元に出し終了で消す", () => { const people = [{ patient, entries: [order("1")] }]; const replies = { "1": replyConsult(undefined, "返書", "井上", "11:00") }; expect(consultNotifications(people, "山本（専攻医）", replies)[0].label).toContain("返書あり"); expect(consultNotifications(people, "山本（専攻医）", { "1": closeConsult(replies["1"]) })).toEqual([]); });
    it("返書を種類つきの記事にする", () => { const n = consultReplyNote("n", "所見・診断・提案・フォロー", "井上", "11:00"); expect(n.category).toBe("コンサルト返書"); expect(n.role).toBe("医師"); expect(n.author).toBe("井上"); });
    it("最新の検査の基準範囲外だけを引用する", () => { const text = quoteConsultSummary({ ...patient, labs: [{ day: -1, time: "09:00", values: { Na: 100 } }, { day: 0, time: "09:00", values: { Na: 140, CRP: 8 } }] }, []); expect(text).toContain("8"); expect(text).not.toContain("100"); expect(text).not.toContain("140"); });
    it("依頼・返書は医師のみ", () => { expect(can("医師", "consult")).toBe(true); expect(can("看護師", "consult")).toBe(false); });
});
