// The pharmacy's 麻薬 tab and the ward's 施用票 render (on the server, without a browser) with what they are given.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { INITIAL_BOOK, receiveSlip, type NarcoticBook } from "@/lib/narcotic-book";
import { PATIENTS } from "@/lib/patients";
import type { OrderEntry } from "@/lib/types";
import { DrugMarks } from "./DrugMarks";
import { NarcoticDesk } from "./NarcoticDesk";
import { NarcoticSlips } from "./NarcoticSlips";
import { RoleProvider } from "./RoleContext";

const TODAY = { y: 2026, m: 11, d: 4 };
const sakura = PATIENTS.find((p) => p.id === "90010231")!;
const mor: OrderEntry = {
  kind: "order",
  id: "o-mor",
  day: 0,
  time: "09:00",
  author: "山本（専攻医）",
  status: "有効",
  order: { type: "injection", items: [{ drugCode: "INJ-MOR10", amount: 5, unit: "mg" }], route: "皮下注", schedule: { kind: "once" }, start: { day: 0, time: "10:00" } },
};
const oxy: OrderEntry = { ...mor, id: "o-oxy", order: { type: "prescription", category: "定期", drugCode: "ORAL-OXC5", amount: 1, unit: "錠", timings: ["朝", "夕"], start: { day: 0, timing: "夕" }, days: 7 } };
const people = [{ patient: sakura, room: "512", entries: [mor, oxy] }];
const noop = () => {};
let n = 0;
const id = () => `x${++n}`;

describe("麻薬の画面", () => {
  it("marks: 麻 and 劇 for the morphine injection, nothing for saline", () => {
    const html = renderToStaticMarkup(<DrugMarks codes={["INJ-MOR10"]} />);
    expect(html).toContain(">麻<");
    expect(html).toContain(">劇<");
    expect(renderToStaticMarkup(<DrugMarks codes={["INJ-NS500"]} />)).toBe("");
  });

  it("the pharmacy tab lists the 麻薬処方箋 with the licence number and the book", () => {
    const html = renderToStaticMarkup(
      <RoleProvider value="薬剤師">
        <NarcoticDesk people={people} today={TODAY} nowTime="11:00" book={INITIAL_BOOK} onBook={noop} newId={id} />
      </RoleProvider>,
    );
    expect(html).toContain("院内麻薬注射せん");
    expect(html).toContain("院内麻薬処方せん");
    expect(html).toContain("第 1-04127 号");
    expect(html).toContain("1回1錠 × 2回 × 7日 ＝ 14錠");
    expect(html).toContain("麻薬帳簿（受払簿）");
    expect(html).toContain("前帳簿から繰越し");
  });

  it("a returned slip waits for the pharmacy; once received, its leftover waits for a witness", () => {
    const slip = { id: "s1", orderId: "o-mor", patientId: sakura.id, code: "INJ-MOR10", marKey: "o-mor|600", usedAt: { day: 0, time: "10:05" }, issuedA: 1, usedMl: 0.5, leftMl: 0.5, unusedA: 0, prescriber: "山本（専攻医）", by: "看護師 佐藤", returnedAt: { day: 0, time: "10:20" } };
    const book: NarcoticBook = { ...INITIAL_BOOK, slips: [slip] };
    const before = renderToStaticMarkup(<NarcoticDesk people={people} today={TODAY} nowTime="11:00" book={book} onBook={noop} newId={id} />);
    expect(before).toContain("受け取った（空アンプル・残液を確かめた）");
    const after = renderToStaticMarkup(<NarcoticDesk people={people} today={TODAY} nowTime="11:00" book={receiveSlip(book, "s1", "薬剤師 小林", { day: 0, time: "11:00" }, "佐倉", id)} onBook={noop} newId={id} />);
    expect(after).toContain("立会いの下に廃棄した");
  });

  it("the ward's 施用票: a 麻薬 dose recorded 実施 asks for the amounts", () => {
    const records = { "o-mor|600": { key: "o-mor|600", orderId: "o-mor", patientId: sakura.id, at: 600, status: "実施" as const, doneAt: "10:05", by: "看護師 佐藤", checked: { patient: true, label: true } } };
    const html = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <NarcoticSlips people={people} records={records} book={INITIAL_BOOK} onBook={noop} today={TODAY} nowTime="10:10" newId={id} />
      </RoleProvider>,
    );
    expect(html).toContain("施用票を書いて薬剤部へ返納");
    expect(html).toContain("施用残量 <b>0.5mL</b>");
    expect(html).toContain("内服の麻薬の返納");
  });
});
