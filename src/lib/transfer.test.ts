import { describe, expect, it } from "vitest";
import { transferAdl, transferRelationship, transferSummary } from "./transfer";
import { emptyAnamnesis } from "./anamnesis";
import { BI_ITEMS, type BiEval } from "./barthel";
import type { OrderEntry } from "./types";
import { PATIENTS } from "./patients";

describe("転院・施設の打診", () => {
  it("summarises without the name or ID", () => {
    const p = PATIENTS[0];
    const lines = transferSummary(p, [], { dietNow: "常食", restrained: false });
    const text = lines.join("\n");
    expect(text).not.toContain(p.name);
    expect(text).not.toContain(p.id);
    expect(lines[0]).toMatch(/^\d0代(男|女)性$/);
    expect(text).toContain(`病名：${p.admissionDiagnosis}`);
  });
});

it("記録のない項目を明記し、自由記載の氏名や住所をコピーしない", () => {
  const fields = { ...emptyAnamnesis(), living: "家族と同居", careInsurance: "要介護2", cognition: "物忘れがある", keyPerson: "長女（架空 花子）", home: "秘密の住所" };
  const text = transferSummary(PATIENTS[0], [], { restrained: false, anamnesis: fields }).join("\n");
  expect(text).toContain("住まい：家族と同居");
  expect(text).toContain("介護保険：要介護2");
  expect(text).toContain("認知：物忘れがある");
  expect(text).toContain("キーパーソン（続柄）：長女");
  expect(text).not.toContain("花子");
  expect(text).not.toContain("秘密");
  expect(text).toContain("日常生活：（記録なし）");
  expect(text).toContain("安静度：（記録なし）");
  expect(transferRelationship("架空 花子（長女）")).toBeUndefined();
  expect(transferRelationship("妻田 花子")).toBeUndefined();
});

it("最新のBIの合計と安静度を使う", () => {
  const make = (day: number, max: boolean): BiEval => ({ id: String(day), patientId: "p", day, time: "09:00", by: "担当", scores: Object.fromEntries(BI_ITEMS.map(i => [i.key, max ? i.options[0].score : 0])) });
  expect(transferAdl([make(0, true), make(-1, false)], "p")).toBe("Barthel Index 100/100点");
  expect(transferAdl([], "p")).toBeUndefined();
  const text = transferSummary(PATIENTS[0], [], { restrained: false, adl: transferAdl([make(0, true)], "p"), rest: "病棟内歩行" }).join("\n");
  expect(text).toContain("日常生活：Barthel Index 100/100点");
  expect(text).toContain("安静度：病棟内歩行");
});

it("定期内服は同じRpをまとめ、中止・頓用・臨時を数えない", () => {
  const rx = (id: string, drugCode: string, rp?: string): OrderEntry => ({ id, kind: "order", status: "有効", order: { type: "prescription", category: "定期", drugCode, rp, amount: 1, unit: "錠", timings: ["朝"], start: { day: 0 } } } as OrderEntry);
  const a = rx("a", "ORAL-API25", "rp1"), b = rx("b", "ORAL-WAR1", "rp1");
  const stopped = { ...rx("c", "unknown"), status: "中止" } as OrderEntry;
  const prn = rx("prn", "ORAL-WAR1");
  if (prn.order.type === "prescription") { prn.order.prn = "必要時"; prn.order.timings = []; }
  const temporary = rx("temp", "ORAL-WAR1");
  if (temporary.order.type === "prescription") temporary.order.category = "臨時";
  const text = transferSummary(PATIENTS[0], [a, b, stopped, prn, temporary], { restrained: false }).join("\n");
  expect(text).toContain("定期の内服：1 Rp");
  expect(text).toContain("抗凝固薬：あり");
  expect(transferSummary(PATIENTS[0], [rx("d", "unknown")], { restrained: false }).join("\n")).not.toContain("インスリン：");
});
