import { describe, expect, it } from "vitest";
import { SCENARIOS } from ".";
import { ordersOf } from "../record";
import { auditItems } from "../pharmacy";
import { buildWorksheet } from "../worksheet";
import { regimenFromOrder } from "../tdm";
import { orderInteractions } from "../interactions";
import { isExtraInjection } from "../pharmacy-work";
import { groupsFor } from "@/components/ToolRail";
const people = SCENARIOS.cases.filter((c) => c.stage === "入院").map(({ patient }) => ({ patient, room: patient.room, entries: ordersOf(patient.history) }));

describe("薬剤部の試験用オーダ", () => {
  it("昨日と今日の監査、内服の定期・臨時・退院時、明日の注射が数人ずつある", () => {
    const audit = auditItems(people, -1440, 1439);
    expect(new Set(audit.map((a) => a.patient.id)).size).toBeGreaterThan(10);
    expect(audit.some((a) => a.entry.day === -1)).toBe(true);
    expect(audit.some((a) => a.entry.day === 0)).toBe(true);
    expect(audit.some((a) => a.entry.order.type === "injection" && a.entry.order.replaces)).toBe(true);
    expect(audit.some((a) => a.entry.order.type === "prescription" && a.entry.order.comment?.includes("変更"))).toBe(true);
    for (const category of ["定期", "臨時", "退院時"]) expect(people.filter((p) => p.entries.some((e) => e.order.type === "prescription" && e.order.category === category)).length).toBeGreaterThan(2);
    expect(new Set(buildWorksheet(people, 1440, 2880, 720).timed.filter((r) => r.kind === "注射").map((r) => r.patientId)).size).toBeGreaterThan(3);
    expect(audit.some((a) => a.checks.some((c) => c.text.includes("同じ成分")))).toBe(true);
    expect(people.some((p) => p.entries.some((e) => orderInteractions(e, p.entries).some((f) => f.level === "併用禁忌")))).toBe(true);
  });
  it("MRSAのVCMは1g・12時間ごとで継続し、トラフと看護観察がある", () => {
    const p = people.find((p) => /MRSA|ＭＲＳＡ/.test(p.patient.admissionDiagnosis))!;
    const e = p.entries.find((e) => e.order.type === "injection" && e.order.items.some((i) => i.drugCode.startsWith("INJ-VCM")))!;
    expect(e.status).toBe("有効");
    if (e.order.type !== "injection") throw new Error("VCM order missing");
    expect(regimenFromOrder(e.order)).toMatchObject({ dose: 1000, tau: 12 });
    expect(e.order.end).toBeUndefined();
    expect(p.patient.labs.some((l) => l.values.VCM > 0)).toBe(true);
    expect(p.patient.history.some((e) => e.kind === "note" && e.role === "看護師" && e.focus?.some((f) => f.d?.includes("点滴刺入部")))).toBe(true);
  });
  it("輸血3製剤、払出、麻薬施用票と返納がある", () => {
    const products = people.flatMap((p) => p.entries.flatMap((e) => e.order.type === "procedure" && e.order.tx ? [e.order.tx.product] : []));
    expect(new Set(products)).toEqual(new Set(["RBC", "FFP", "PC"]));
    expect(Object.keys(SCENARIOS.txIssued).length).toBeGreaterThan(2);
    expect(SCENARIOS.narcBook.slips.length).toBeGreaterThan(2);
    expect(SCENARIOS.narcBook.ledger.filter((e) => e.kind === "返納").length).toBeGreaterThan(2);
  });
  it("今日の臨時・追加に前から続く定時注射を混ぜない", () => {
    const regular = people.flatMap((p) => p.entries).find((e) => e.day < 0 && e.order.type === "injection" && e.order.schedule.kind === "per_day")!;
    expect(isExtraInjection(regular, 0)).toBe(false);
    expect(isExtraInjection({ ...regular, day: 0 }, 0)).toBe(true);
  });
  it("薬剤師の介入から4業務へ入れる", () => {
    expect(groupsFor("薬剤師").find((g) => g.key === "intervention")!.main.slice(0, 4).map((t) => t.label)).toEqual(["服薬指導", "持参薬鑑別", "TDM", "疑義照会"]);
    expect(groupsFor("医師").flatMap((g) => g.main).some((t) => t.key.startsWith("pharmacy-"))).toBe(false);
  });
});
