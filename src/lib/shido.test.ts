import { describe, expect, it } from "vitest";
import { EMPTY_FORM, kindNotes, shidoFacts, shidoProblems, shidoText, type ShidoForm } from "./shido";
import type { OrderEntry } from "./types";

const pt = { name: "佐倉 修", sex: "男" as const, age: 72, id: "90010231", admittedOn: -3, allergies: ["セフェム系（発疹）"] };
const mk = (id: string, order: OrderEntry["order"], status: OrderEntry["status"] = "有効"): OrderEntry => ({ kind: "order", id, day: 0, time: "09:00", author: "山本（専攻医）", status, order });
const met = mk("m", { type: "prescription", category: "定期", drugCode: "ORAL-MET250", amount: 1, unit: "錠", timings: ["朝", "夕"], start: { day: 0, timing: "夕" }, days: 7 });
const oxy = mk("o", { type: "prescription", category: "定期", drugCode: "ORAL-OXC5", amount: 1, unit: "錠", timings: ["朝", "夕"], start: { day: 0, timing: "夕" }, days: 7 });
const amlo = mk("a", { type: "prescription", category: "定期", drugCode: "ORAL-AMLO5", amount: 1, unit: "錠", timings: ["朝"], start: { day: 1, timing: "朝" } });
const stopped = mk("s", { type: "injection", items: [{ drugCode: "INJ-KCL20", amount: 20, unit: "mEq" }], route: "点滴静注", schedule: { kind: "once" }, start: { day: -1 } }, "中止");

describe("薬剤管理指導記録（B008 (5)）", () => {
  it("takes what the chart has: running drugs, the「1」groups and the 麻薬", () => {
    const f = shidoFacts(pt, [met, oxy, amlo, stopped]);
    expect(f.drugs).toHaveLength(3);
    expect(f.special).toEqual([{ code: "ORAL-MET250", group: "糖尿病用剤" }]);
    expect(f.narcotics).toEqual(["ORAL-OXC5"]);
  });

  it("says when「1」has no target drug, and when a 麻薬 runs without the 麻薬 part", () => {
    const none = shidoFacts(pt, [amlo]);
    expect(kindNotes({ ...EMPTY_FORM, kind: "1" }, none)[0]).toContain("見当たりません");
    const both = shidoFacts(pt, [met, oxy]);
    const notes = kindNotes(EMPTY_FORM, both);
    expect(notes.some((n) => n.includes("「1」の対象の薬があります"))).toBe(true);
    expect(notes.some((n) => n.includes("麻薬管理指導加算の欄"))).toBe(true);
    expect(kindNotes({ ...EMPTY_FORM, narcotic: { status: "", teaching: "", other: "" } }, none)[0]).toContain("麻薬が投与されている患者のときだけ");
  });

  it("needs the doctor's consent, the content and the teaching (and ア・イ for the 麻薬 add-on)", () => {
    expect(shidoProblems(EMPTY_FORM)).toEqual(["医師の同意", "薬学的管理指導の内容", "患者への指導・相談事項"]);
    const ok: ShidoForm = { kind: "1", consent: true, sideEffects: "", management: "腎機能と量を確認", teaching: "飲み忘れたときの対応を説明" };
    expect(shidoProblems(ok)).toEqual([]);
    expect(shidoProblems({ ...ok, narcotic: { status: "", teaching: "", other: "" } })).toHaveLength(2);
  });

  it("writes the record as one note", () => {
    const f = shidoFacts(pt, [met, oxy]);
    const t = shidoText({ kind: "1", consent: true, sideEffects: "", management: "量を確認", teaching: "説明した", narcotic: { status: "1日2回飲めている。痛み NRS 3", teaching: "眠気のときは知らせる", other: "" } }, f, (d) => `D${d}`);
    expect(t).toContain("区分1（メトホルミン塩酸塩錠：糖尿病用剤）・麻薬管理指導");
    expect(t).toContain("入院 D-3");
    expect(t).toContain("アレルギー歴：セフェム系（発疹）");
    expect(t).toContain("麻薬 ア：1日2回飲めている");
    expect(t).not.toContain("麻薬 ウ");
  });
});
