import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShidoPanel } from "./ShidoPanel";
import { PharmacyView, type PharmacyProps } from "./PharmacyView";
import { SCENARIOS } from "@/lib/scenarios";
import { ordersOf } from "@/lib/record";
import { ADOPTED_ORAL } from "@/lib/formulary-items";
import { rxItems } from "@/lib/narcotics";
import { anyDrugName } from "@/lib/master";
const today = { y: 2026, m: 11, d: 6 };
const people = SCENARIOS.cases.filter((c) => c.stage === "入院").slice(0, 2).map(({ patient }) => ({ patient, room: patient.room, entries: ordersOf(patient.history) }));
const noop = () => {};
const props: PharmacyProps = { people, today, nowTime: "20:59", audited: {}, onAudit: noop, queries: [], onAsk: noop, reports: [], onReport: noop, shido: {}, onShido: noop, dispensed: {}, onDispense: noop, txIssued: {}, journal: [], onJournal: noop, homeRx: {}, onHomeRx: noop, oralRx: {}, onOralRx: noop, tdm: [], onTdm: noop, narcBook: SCENARIOS.narcBook, onNarcBook: noop, newId: () => "test" };

describe("薬剤師点検の画面", () => {
  it("既存の指導記録を表示し、今回の保存前には完了を表示しない", () => {
    const html = renderToStaticMarkup(<ShidoPanel people={people} today={today} records={{ [people[0].patient.id]: [{ day: 0, kind: "2", text: "服用方法を確認した", at: "09:00" }] }} onRecord={noop} />);
    expect(html).not.toContain("記録しました");
    expect(html).toContain("服用方法を確認した");
    expect(html).not.toContain("まだ：");
    expect(html).not.toContain("生年月日・退院年月日は");
  });
  it("カルテから開いた業務はその患者を選択し、戻る入口を持つ", () => {
    const html = renderToStaticMarkup(<PharmacyView {...props} initialTab="shido" patientId={people[1].patient.id} onClose={noop} />);
    expect(html).toContain("カルテに戻る");
    expect(html).toContain(people[1].patient.name);
    expect(html).not.toContain(people[0].patient.name);
    expect(html).not.toContain("として操作します");
    expect(html).not.toContain("使い方");
  });
  it("麻薬品名はNFKCで表示する", () => {
    const row = ADOPTED_ORAL.find((r) => r[1].includes("ＭＳコンチン"))!;
    expect(row).toBeDefined();
    const name = anyDrugName(row[0]);
    expect(name).toContain("MSコンチン");
    expect(name).toBe(name.normalize("NFKC"));
    const entry = { ...people[0].entries[0], order: { type: "prescription" as const, category: "定期" as const, drugCode: row[0], amount: 1, unit: "錠", timings: ["朝" as const], start: { day: 0 }, days: 3 } };
    expect(rxItems(entry, people[0].patient, today).find((r) => r.item === "麻薬の品名")!.value).toContain("MSコンチン");
  });
});

// The static screen checks cover disabled controls as well as the reason shown next to them.
describe("薬剤部の払出入口", () => {
  const allPeople = SCENARIOS.cases.filter((c) => c.stage === "入院").map(({ patient }) => ({ patient, room: patient.room, entries: ordersOf(patient.history) }));
  it("未監査の退院時処方は調剤できず、その場で監査できる", () => {
    const html = renderToStaticMarkup(<PharmacyView {...props} people={allPeople} initialTab="home" />);
    expect(html).toContain("まだ監査していません");
    expect(html).toContain("監査済にする");
    expect(html).toMatch(/disabled=""[^>]*>調剤した<\/button>/);
  });
  it("麻薬は内服の個別操作・まとめ操作の対象にしない", () => {
    const x = allPeople.find((x) => x.entries.some((e) => e.order.type === "prescription" && e.order.drugCode === "ORAL-OXC5"))!;
    const narcoticsOnly = { ...x, entries: x.entries.filter((e) => e.order.type === "prescription" && e.order.drugCode === "ORAL-OXC5") };
    const html = renderToStaticMarkup(<PharmacyView {...props} people={[narcoticsOnly]} initialTab="oral" />);
    expect(html).toContain("麻薬の画面で払出");
    expect(html).toMatch(/disabled=""[^>]*>まとめて払出（0）/);
    expect(html).toMatch(/disabled=""[^>]*>麻薬の画面で払出<\/button>/);
  });
  it("監査カードに年齢・体重・カルテと同じ推定CCr・アレルギーと絞り込みがある", () => {
    const html = renderToStaticMarkup(<PharmacyView {...props} initialTab="audit" />);
    expect(html).toContain("未監査だけ");
    expect(html).toContain("推定CCr");
    expect(html).toContain("kg");
    expect(html).toContain("アレルギー：");
  });
});
