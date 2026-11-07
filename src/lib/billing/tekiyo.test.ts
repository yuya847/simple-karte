import { describe, it, expect } from "vitest";
import { loadTekiyoMaster } from "./tekiyo-master";
import { applyTekiyo, commentProblem, resolveTekiyo, tekiyoMasterRows, type TekiyoAnswer, type TekiyoInput } from "./tekiyo";
import { commentItem } from "./master-items";
import type { ClaimResult } from "./model";
import type { OrderEntry } from "../types";
const claim = (code = "190171910", name = "救急医療管理加算１"): ClaimResult => ({ month: "2026-11", from: 7, to: 7, days: 1, acts: [{ shikibetsu: "90", parts: [{ lines: [{ record: "SI", code, name }], points: 100 }], count: 1, days: { 7: 1 }, basis: "" }], totalPoints: 100, meals: { ryoyoYen: 0, futanYen: 0 }, issues: [{ level: "review", text: "救急医療管理加算1：コメントが要ります。いまは自動では入りません。" }], sources: [] });
const input: TekiyoInput = { patientId: "p", today: "2026-11-07", entries: [], master: loadTekiyoMaster() };
const answer: TekiyoAnswer = { patientId: "p", month: "2026-11", claimCode: "190171910", by: "医師", at: "2026-11-07T12:00:00+09:00", reviewedRequirements: true, comments: [{ code: "820100411" }, { code: "831110001", text: "160000310" }] };
describe("摘要コメント", () => {
  it("公開20261001マスターのコード・文を読む（終了日を使わない）", () => {
    expect(input.master.find(m => m.code === "820100411")?.name).toContain("急性薬物中毒");
    expect(commentItem("820100411")?.code).toBe("820100411");
    expect(tekiyoMasterRows([["不正"]])).toEqual([]);
  });
  it("救急は候補を返し、記事の単語から重症状態を決めない", () => {
    const tasks = resolveTekiyo(claim(), { ...input, entries: [{ kind: "note", day: 0, time: "10:00", author: "医師", role: "医師", text: "急性薬物中毒" }] });
    expect(tasks[0].status).toBe("人が選ぶ");
    expect(tasks[0].comments).toEqual([]);
    expect(tasks[0].candidates.some(c => c.code === "820100411")).toBe(true);
    expect(applyTekiyo(claim(), tasks).issues).toHaveLength(1);
  });
  it("状態＋主要診療行為と医師の確認が揃って警告を消し、点数と回数を保持", () => {
    const original = claim();
    const tasks = resolveTekiyo(original, { ...input, answers: [answer] });
    expect(tasks[0].status).toBe("選択済み");
    const result = applyTekiyo(original, tasks);
    expect(result.issues).toEqual([]);
    expect(result.totalPoints).toBe(original.totalPoints);
    expect(result.acts[0].count).toBe(original.acts[0].count);
    expect(result.acts[0].days).toEqual(original.acts[0].days);
    expect(original.acts[0].parts[0].lines[0].comments).toBeUndefined();
    expect(applyTekiyo(result, tasks)).toEqual(result);
  });
  it.each([
    { ...answer, reviewedRequirements: false },
    { ...answer, patientId: "other" },
    { ...answer, month: "2026-10" },
    { ...answer, comments: [{ code: "820100411" }] },
    { ...answer, comments: [{ code: "820100440" }, { code: "831110001", text: "160000310" }] },
    { ...answer, comments: [{ code: "820100411" }, { code: "831110001", text: "不明" }] },
  ])("確認不足・別患者月・別区分・不正形式は出力しない", a => {
    const tasks = resolveTekiyo(claim(), { ...input, answers: [a] });
    expect(tasks[0].status).toBe("人が選ぶ");
    expect(tasks[0].comments).toEqual([]);
  });
  it("3件を超えても捨てずにCO用の配列に保存", () => {
    const c = claim();
    c.acts[0].parts[0].lines[0].comments = [{ code: "820100393", label: "既存1" }, { code: "820100395", label: "既存2" }, { code: "820100396", label: "既存3" }];
    const tasks = resolveTekiyo(c, { ...input, answers: [answer] });
    const applied = applyTekiyo(c, tasks);
    expect(applied.acts[0].parts[0].lines[0].comments).toHaveLength(3);
    expect(applied.acts[0].comments?.map(c => c.code)).toEqual(["820100411", "831110001"]);
    expect(applyTekiyo(applied, tasks)).toEqual(applied);
  });
  it("薬剤管理指導１は薬剤名を人が選び、２には追加コードを要求しない", () => {
    expect(resolveTekiyo(claim("113010810", "薬剤管理指導料１"), input)[0].candidates.map(m => m.code)).toEqual(["830100078"]);
    expect(resolveTekiyo(claim("120001610", "薬剤管理指導料２"), input)).toEqual([]);
  });
  it("実施済みCTの撮影部位を自動で付け、未実施と複合部位は人が選ぶ", () => {
    const e: OrderEntry = { kind: "order", id: "ct", day: 0, time: "09:00", author: "医師", status: "実施済", exam: { done: { day: 0, time: "10:00" } }, order: { type: "imaging", modality: "CT", region: "R-CHEST", purpose: "確認", when: { day: 0, priority: "至急" }, transport: "独歩" } };
    const c = claim("170032810", "ＣＴ撮影（１６列以上６４列未満）");
    const task = resolveTekiyo(c, { ...input, entries: [e] })[0];
    expect(task.status).toBe("自動");
    expect(task.comments[0].code).toBe("820182210");
    expect(task.evidence).toEqual([e]);
    expect(resolveTekiyo(c, { ...input, entries: [{ ...e, exam: { notDone: true } }] })[0].status).toBe("人が選ぶ");
    expect(resolveTekiyo(c, { ...input, entries: [{ ...e, order: { ...e.order, type: "imaging", modality: "CT", region: "R-CHEST-ABD", purpose: "確認", when: { day: 0, priority: "至急" }, transport: "独歩" } }] })[0].status).toBe("人が選ぶ");
  });
  it("文字データの76バイトと区切り、選択式、医科コードを検証", () => {
    const m = input.master.find(m => m.code === "830100078")!;
    expect(commentProblem(m, "薬".repeat(38))).toBeUndefined();
    expect(commentProblem(m, "薬".repeat(39))).toBeDefined();
    expect(commentProblem(m, "薬,薬")).toBeDefined();
    expect(commentProblem(m, "薬\n薬")).toBeDefined();
    expect(commentProblem(m, "😀")).toBeDefined();
  });
});

it("単純写真診断の部位は別表Ⅰの単純撮影コードを使い、CT用を転用しない", () => {
  const e: OrderEntry = { kind: "order", id: "xray", day: 0, time: "09:00", author: "医師", status: "実施済", exam: { done: { day: 0, time: "10:00" } }, order: { type: "imaging", modality: "ポータブルX線", region: "R-CHEST", purpose: "確認", when: { day: 0, priority: "至急" }, transport: "病室（ポータブル）" } };
  const task = resolveTekiyo(claim("170000410", "写真診断（単純撮影）"), { ...input, entries: [e] })[0];
  expect(task.status).toBe("自動");
  expect(task.comments[0].code).toBe("820181220");
});
