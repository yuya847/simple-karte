import { describe, it, expect } from "vitest";
import { requiredShoki, collectShokiFacts, shokiRecords, type Shoki } from "./shoki";
import { sjisLength } from "./sjis";
import { kisaiWorkspace } from "./kisai-workspace";
import type { ClaimResult } from "./model";
const claim = (code: string): ClaimResult => ({ month: "2026-11", from: 7, to: 7, days: 1, acts: [{ shikibetsu: "60", parts: [{ lines: [{ record: "SI", code, name: "検査" }], points: 1700 }], count: 1, days: { 7: 1 }, basis: "" }], totalPoints: 1700, meals: { ryoyoYen: 0, futanYen: 0 }, issues: [], sources: [] });
export const shoki: Shoki = { id: "s", patientId: "p", month: "2026-11", targets: [], category: "03", body: "発熱のため入院。", status: "確定", by: "試験医師", at: "2026-11-07T12:00:00+09:00", version: 1 };
describe("症状詳記", () => {
  it("必須項目をコードで判定し、通常の入院・救急に一律要求しない", () => {
    expect(requiredShoki(claim("160183610"))[0]).toMatchObject({ target: { kubun: "D310 3", code: "160183610" }, alternative: "摘要欄でも可" });
    expect(requiredShoki(claim("190171910"))).toEqual([]);
    expect(requiredShoki(claim("190199910"))).toEqual([]);
  });
  it("日付順の事実と見出しだけを並べ、前月・翌月を含めない", () => {
    const facts = collectShokiFacts({ today: "2026-11-07", month: "2026-11", diagnoses: [], labs: [{ day: 0, time: "10:00", values: { CRP: 3, Na: 140 } }, { day: -1, time: "10:00", values: { CRP: 4 } }, { day: -7, time: "10:00", values: { CRP: 5 } }], labCodes: ["CRP"], entries: [{ kind: "note", day: 0, time: "11:00", author: "医師", role: "医師", text: "発熱の経過\n解熱傾向" }] });
    expect(facts.labs.map(x => [x.date, x.value])).toEqual([["2026-11-06", 4], ["2026-11-07", 3]]);
    expect(facts.notes[0].heading).toBe("発熱の経過");
  });
  it("2400バイトで分割・段落ごとにSJ・続きは区分省略", () => {
    const records = shokiRecords([{ ...shoki, body: "あ".repeat(1201) + "\n経過,確認" }], "p", "2026-11");
    expect(records).toHaveLength(3);
    expect(records[0].startsWith("SJ,03,")).toBe(true);
    expect(sjisLength(records[0].split(",")[2])).toBe(2400);
    expect(records[1]).toBe("SJ,,あ");
    expect(records[2]).toBe("SJ,,経過，確認");
  });
  it("下書き・別患者・別月を出さない", () => {
    expect(shokiRecords([{ ...shoki, status: "下書き" }, { ...shoki, patientId: "other" }, { ...shoki, month: "2026-10" }], "p", "2026-11")).toEqual([]);
  });
  it("同一区分はまとめ、確定の空文・機種依存文字を拒否", () => {
    expect(shokiRecords([shoki, { ...shoki, id: "s2", body: "経過" }], "p", "2026-11")).toEqual(["SJ,03,発熱のため入院。", "SJ,,経過"]);
    expect(() => shokiRecords([{ ...shoki, body: "" }], "p", "2026-11")).toThrow();
    expect(() => shokiRecords([{ ...shoki, body: "😀" }], "p", "2026-11")).toThrow();
  });
  it("保存がない場合は空、読み出しは保存内容を変更しない", () => {
    expect(kisaiWorkspace()).toEqual({ shoki: [], tekiyoAnswers: [] });
    const saved = { shoki: [shoki] };
    const next = kisaiWorkspace(saved); next.shoki[0].body = "変更";
    expect(saved.shoki[0].body).toBe(shoki.body);
  });
});

describe("詳記の薬剤事実", () => {
  it("継続中の薬の名前・指示量と開始日を返し、終了済みの前月分を外す", () => {
    const e = { kind: "order" as const, id: "rx", day: -10, time: "10:00", author: "医師", status: "有効" as const, order: { type: "prescription" as const, category: "定期" as const, drugCode: "ORAL-AMPC250", amount: 2, unit: "錠", timings: ["朝" as const], start: { day: -10 } } };
    const facts = collectShokiFacts({ today: "2026-11-07", month: "2026-11", diagnoses: [], labs: [], entries: [e, { ...e, id: "old", order: { ...e.order, days: 1 } }] });
    expect(facts.medications).toHaveLength(1);
    expect(facts.medications[0]).toMatchObject({ date: "2026-10-28", kind: "指示（実投与は別途確認）", items: [{ drugCode: "ORAL-AMPC250", amount: 2, unit: "錠" }] });
    expect(facts.medications[0].items[0].name).not.toBe("ORAL-AMPC250");
  });
});
