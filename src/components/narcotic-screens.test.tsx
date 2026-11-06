// The pharmacy's 麻薬 tab and the ward's 施用票 render (on the server, without a browser) with what they are given.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { INITIAL_BOOK, receiveSlip, type NarcoticBook } from "@/lib/narcotic-book";
import { PATIENTS } from "@/lib/patients";
import type { OrderEntry } from "@/lib/types";
import { BroughtReportSheet } from "./BroughtReportSheet";
import { DrugMarks } from "./DrugMarks";
import { NarcoticDesk } from "./NarcoticDesk";
import { NarcoticSlips } from "./NarcoticSlips";
import { RoleProvider } from "./RoleContext";
import { ShidoPanel } from "./ShidoPanel";

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
    expect(html).not.toContain("法 第27条第6項");
    expect(html).not.toContain("院内の調剤所で調剤するため省略");
    expect(html).toContain("1回1錠 × 2回 × 7日 ＝ 14錠");
    expect(html).toContain("麻薬帳簿（受払簿）");
    expect(html).toContain("前帳簿から繰越し");
  });

  it("an oral 麻薬 waits for the 監査 like any order (the reason is shown)", () => {
    const signed = { ...INITIAL_BOOK, signed: { "o-oxy": { by: "薬剤師 小林", at: { day: 0, time: "10:00" } } } };
    const html = renderToStaticMarkup(<NarcoticDesk people={people} today={TODAY} nowTime="11:00" book={signed} onBook={noop} newId={id} blockOf={(oid) => (oid === "o-oxy" ? "まだ監査していません。" : null)} />);
    expect(html).toContain("まだ監査していません。");
  });

  it("a returned slip waits for the pharmacy; once received, its leftover waits for a witness", () => {
    const slip = { id: "s1", orderId: "o-mor", patientId: sakura.id, code: "INJ-MOR10", marKey: "o-mor|600", usedAt: { day: 0, time: "10:05" }, issuedA: 1, usedMl: 0.5, leftMl: 0.5, unusedA: 0, prescriber: "山本（専攻医）", by: "看護師 佐藤", returnedAt: { day: 0, time: "10:20" } };
    const book: NarcoticBook = { ...INITIAL_BOOK, slips: [slip] };
    const before = renderToStaticMarkup(<NarcoticDesk people={people} today={TODAY} nowTime="11:00" book={book} onBook={noop} newId={id} />);
    expect(before).toContain("受け取った（空アンプル・残液を確かめた）");
    const after = renderToStaticMarkup(<NarcoticDesk people={people} today={TODAY} nowTime="11:00" book={receiveSlip(book, "s1", "薬剤師 小林", { day: 0, time: "11:00" }, "佐倉", id)} onBook={noop} newId={id} />);
    expect(after).toContain("立会いの下に廃棄した");
  });

  it("持参薬鑑別報告書: the count, the days it lasts, the 規制区分 and the doctor's choice", () => {
    const html = renderToStaticMarkup(
      <BroughtReportSheet
        r={{ id: "r1", patientId: sakura.id, by: "薬剤師 小林", at: "09:30", status: "指示済", comment: "自己管理できている", rows: [{ said: "オキシコンチンTR錠", strength: "5mg", amount: 1, unit: "錠", timings: ["朝", "夕"], daysLeft: 14, prn: null, match: "ORAL-OXC5", checked: true, decision: "持参薬で継続", counted: 9, note: "残数は手帳より少ない" }] }}
        patient={sakura}
        room="512"
        date="11/4（水）"
      />,
    );
    expect(html).toContain("持参薬鑑別報告書");
    expect(html).toContain("9錠 ÷（1回1錠 × 2回）＝ 4日分");
    expect(html).toContain("劇薬・麻薬・処方箋医薬品");
    expect(html).toContain("持参薬で継続");
    expect(html).toContain("自己管理できている");
  });

  it("服薬指導: the chart's drugs with marks, and the 麻薬管理指導加算 reminder", () => {
    const html = renderToStaticMarkup(<ShidoPanel people={people} today={TODAY} records={{}} onRecord={noop} />);
    expect(html).toContain("医師の同意を得ている");
    expect(html).toContain("麻薬管理指導加算の欄");
    expect(html).toContain("まだ：医師の同意・薬学的管理指導の内容・患者への指導・相談事項");
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
