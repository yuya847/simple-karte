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
  it("MRSAのVCMは1g・12時間ごとで退院前に終了し、トラフと看護観察がある", () => {
    const p = people.find((p) => /MRSA|ＭＲＳＡ/.test(p.patient.admissionDiagnosis))!;
    const e = p.entries.find((e) => e.order.type === "injection" && e.order.items.some((i) => i.drugCode.startsWith("INJ-VCM")))!;
    expect(e.status).toBe("有効");
    if (e.order.type !== "injection") throw new Error("VCM order missing");
    expect(regimenFromOrder(e.order)).toMatchObject({ dose: 1000, tau: 12 });
    expect(e.order.end).toEqual({ day: 1, time: "10:00" });
    const doses = buildWorksheet([p], 1440, 2880, 720).timed.filter((r) => r.orderId === e.id);
    expect(doses.map((r) => r.at)).toEqual([1440]);
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

describe("薬剤部データの整合", () => {
  it("病名に合う薬剤が入り、全員共通の生食の追加を作らない", () => {
    const heart = people.filter((x) => /心不全/.test(x.patient.admissionDiagnosis));
    expect(heart.length).toBeGreaterThan(0);
    for (const x of heart) {
      const codes = x.entries.filter((e) => e.status === "有効").flatMap((e) => e.order.type === "prescription" ? [e.order.drugCode] : []);
      expect(codes).toEqual(expect.arrayContaining(["ORAL-FRS20", "ORAL-SPL25", "ORAL-ENA5"]));
    }
    expect(people.flatMap((x) => x.entries).some((e) => e.id.endsWith("-pharmacy-extra"))).toBe(false);
    const diabetes = people.find((x) => /糖尿病/.test(x.patient.admissionDiagnosis))!;
    expect(diabetes.entries.some((e) => e.order.type === "prescription" && e.order.drugCode === "ORAL-MET250" && e.order.timings.length === 2)).toBe(true);
  });
  it("補液の変更は参照先の旧オーダが中止されている", () => {
    for (const x of people) for (const e of x.entries) {
      if (e.order.type !== "injection" || !e.id.includes("-pharmacy-") || !e.order.replaces) continue;
      const previous = x.entries.find((p) => p.id === (e.order.type === "injection" ? e.order.replaces : ""));
      expect(previous).toMatchObject({ status: "中止", stoppedOn: 0, stoppedTime: "08:00" });
      expect(previous?.order.type === "injection" && previous.order.comment).toContain("変更");
    }
  });
  it("アムロジピンは1日1回、退院処方は病名により異なる", () => {
    const home = people.flatMap((x) => x.entries).filter((e) => e.order.type === "prescription" && e.order.category === "退院時");
    expect(new Set(home.flatMap((e) => e.order.type === "prescription" ? [e.order.drugCode] : [])).size).toBeGreaterThan(1);
    for (const e of people.flatMap((x) => x.entries)) if (e.id.includes("-pharmacy-") && e.order.type === "prescription" && e.order.drugCode === "ORAL-AMLO5") expect(e.order.timings).toEqual(["朝"]);
  });
  it("VCMのない患者にはVCMのTDM報告を入れない", () => {
    for (const x of people) {
      if (x.entries.some((e) => e.order.type === "injection" && e.order.items.some((i) => i.drugCode.startsWith("INJ-VCM")))) continue;
      expect(x.patient.history.some((e) => e.kind === "note" && /TDM|トラフ/.test(e.text ?? "") && /VCM|バンコマイシン|抗MRSA/.test(e.text ?? ""))).toBe(false);
    }
  });
});
