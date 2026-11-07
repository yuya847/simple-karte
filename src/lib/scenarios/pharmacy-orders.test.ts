import { LICENCES } from "../narcotics";
import { pharmacyBook } from "./pharmacy-orders";
import { merge3 } from "../merge-workspace";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from ".";
import { ordersOf } from "../record";
import { auditItems } from "../pharmacy";
import { buildWorksheet } from "../worksheet";
import { regimenFromOrder } from "../tdm";
import { orderInteractions } from "../interactions";
import { isExtraInjection } from "../pharmacy-work";
import { groupsFor } from "@/components/ToolRail";
// These assertions describe the pharmacy fixtures of the original cohort.
const people = SCENARIOS.cases.slice(0, 100).filter((c) => c.stage === "入院").map(({ patient }) => ({ patient, room: patient.room, entries: ordersOf(patient.history) }));

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
  it("MRSAのVCMは1g・12時間ごとで、治療中の明日退院を作らない", () => {
    const p = people.find((p) => /MRSA|ＭＲＳＡ/.test(p.patient.admissionDiagnosis))!;
    const e = p.entries.find((e) => e.order.type === "injection" && e.order.items.some((i) => i.drugCode.startsWith("INJ-VCM")))!;
    expect(e.status).toBe("有効");
    if (e.order.type !== "injection") throw new Error("VCM order missing");
    expect(regimenFromOrder(e.order)).toMatchObject({ dose: 1000, tau: 12 });
    expect(p.entries.some(e => e.order.type === "procedure" && e.order.leave?.kind === "退院")).toBe(false);
    const doses = buildWorksheet([p], 1440, 2880, 720).timed.filter((r) => r.orderId === e.id);
    expect(doses.every(r => r.at! < (e.order.type === "injection" && e.order.end ? (e.order.end.day + 1) * 1440 : Infinity))).toBe(true);
    expect(p.patient.labs.some((l) => l.values.VCM > 0)).toBe(true);
    expect(p.patient.history.some((e) => e.kind === "note" && e.role === "看護師" && e.focus?.some((f) => f.d?.includes("点滴刺入部")))).toBe(true);
  });
  it("血算の根拠のない輸血を作らず、麻薬施用票と返納がある", () => {
    for (const p of people) for (const e of p.entries) if (e.order.type === "procedure" && e.order.tx) {
      expect(e.order.tx.product).toBe("RBC");
      expect(p.patient.admissionDiagnosis).toMatch(/消化管出血|憩室出血/);
      expect(p.patient.labs.at(-1)?.values.Hb).toBeLessThan(8);
    }
    expect(SCENARIOS.narcBook.slips.length).toBeGreaterThan(2);
    expect(SCENARIOS.narcBook.ledger.filter((e) => e.kind === "返納")).toHaveLength(1);
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

it("100人の試験データでも返納例は1件で、施用票の患者と施用者免許を特定できる", () => {
  const patients = SCENARIOS.cases.map(c => c.patient);
  const book = pharmacyBook(patients);
  const returns = book.ledger.filter(e => e.kind === "返納");
  expect(returns).toHaveLength(1);
  expect(patients.find(p => p.id === returns[0].patientId)?.name).toBeTruthy();
  expect(book.slips.length).toBeGreaterThan(0);
  for (const slip of book.slips) {
    expect(patients.find(p => p.id === slip.patientId)?.name).toBeTruthy();
    expect(LICENCES[slip.prescriber]?.find(l => l.kind === "麻薬施用者")?.no).toBeTruthy();
  }
  const merged = merge3(book, book, undefined) as typeof book;
  expect(merged.ledger.filter(e => e.kind === "返納")).toHaveLength(1);
  expect(merged.slips).toHaveLength(book.slips.length);
});
