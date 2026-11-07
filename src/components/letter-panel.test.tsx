import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoleProvider } from "./RoleContext";
import { LetterPanel } from "./panels/LetterPanel";
import { LetterDoc } from "./LetterDoc";
import { HistoryPane } from "./HistoryPane";
import { PATIENTS } from "@/lib/patients";
import { confirmLetter, newLetter, type Letter } from "@/lib/letters";
import type { Role } from "@/lib/roles";

const today = { y: 2026, m: 11, d: 7 };
const patient = PATIENTS[0];
const chart = { patient, entries: patient.history, diagnoses: [], today };
const as = (role: Role, node: ReactNode) => renderToStaticMarkup(createElement(RoleProvider, { value: role }, node));
const panel = (letters: Letter[] = [], open: { id?: string } | null = null) =>
  createElement(LetterPanel, { patient, entries: patient.history, diagnoses: [], today, nowTime: "10:00", letters, open, newId: () => "new", onSave() {} });
const done = confirmLetter({ ...newLetter("a", chart, "紹介", "山本（専攻医）", { day: 0, time: "09:00" }), to: "架空みどり病院", dept: "循環器内科", flags: { consent: true } }, undefined, "山本（専攻医）", { day: 0, time: "09:30" });

describe("紹介状の道具", () => {
  it("種類のタブ、宛先、算定の見込み1行、3つのボタン", () => {
    const html = as("医師", panel());
    for (const tab of ["紹介", "返書", "照会", "老健・介護医療院", "市町村・居宅", "歯科", "セカンドオピニオン"]) expect(html).toContain(`>${tab}</button>`);
    expect(html).toContain("紹介先の医療機関");
    expect(html).toContain("算定なし：患者の同意の記録がない");
    for (const b of ["下書きを保存", "確定して保存", "印刷"]) expect(html).toContain(b);
    expect(html).toContain(patient.admissionDiagnosis);
  });
  it("MSW は介護・福祉宛ての下書きから始まり、確定は押せない", () => {
    const html = as("MSW", panel());
    expect(html).toContain('aria-selected="true" class="rounded-md border px-3 py-1 text-xs border-ink bg-ink font-bold text-white">老健・介護医療院');
    expect(html).toMatch(/disabled="" class="rounded bg-wakatake[^"]*">確定して保存/);
  });
  it("確定した紹介状は読むだけで、医師には修正の入口と版がある。一覧に出る", () => {
    const html = as("医師", panel([done], { id: "a" }));
    expect(html).toContain("確定 第1版");
    expect(html).toContain("修正する");
    expect(html).toContain("B009 250点・紹介先ごとに月1回");
    expect(html).toContain("架空みどり病院 循環器内科（紹介）");
    expect(html).not.toContain("下書きを保存");
  });
  it("電子署名（模擬）と電子で送る（模擬）：下書きでは押せず、署名してから送れ、送ると一覧に札。老健宛ては灰色で理由は title", () => {
    const button = (html: string, label: string) => html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}</button>`))?.[0] ?? "";
    const draftHtml = as("医師", panel());
    expect(button(draftHtml, "電子署名（模擬）")).toContain('title="確定した紹介状だけ"');
    expect(button(draftHtml, "電子で送る（模擬）")).toContain('disabled=""');
    expect(button(as("医師", panel([done], { id: "a" })), "電子で送る（模擬）")).toContain('title="足りない：紹介目的が空"');
    const full: Letter = { ...done, purpose: "経過観察のお願い" };
    const html = as("医師", panel([full], { id: "a" }));
    expect(button(html, "電子署名（模擬）")).not.toContain('disabled=""');
    expect(button(html, "電子で送る（模擬）")).toContain('title="電子署名（模擬）してから"');
    const record = { id: "s", patientId: patient.id, kind: "診療情報提供書" as const, docHash: "0".repeat(64), signature: "x", keyId: "abcdef0123456789", signer: "山本（専攻医）", role: "医師", at: { date: "2026-11-07", time: "09:40:00" }, alg: "ECDSA P-256 / SHA-256（模擬）" as const };
    const signed: Letter = { ...full, signed: { version: 1, record } };
    expect(button(as("医師", panel([signed], { id: "a" })), "電子で送る（模擬）")).not.toContain('disabled=""');
    const sent: Letter = { ...signed, sends: [{ at: { day: 0, time: "09:45" }, by: "山本（専攻医）", version: 1, documentId: "1419900010^2026^DOC-a", to: "架空みどり病院", receiptNo: "R00000001", attached: false }] };
    const sentHtml = as("医師", panel([sent], { id: "a" }));
    expect(button(sentHtml, "送信済み（模擬）")).toContain('disabled=""');
    expect(sentHtml).toContain("受付番号 R00000001");
    expect(sentHtml).toContain('font-bold text-ai">送信済み（模擬）</span>');
    const care = confirmLetter({ ...newLetter("k", chart, "介護施設", "山本（専攻医）", { day: 0, time: "09:00" }), to: "架空の老健" }, undefined, "山本（専攻医）", { day: 0, time: "09:30" });
    const careHtml = as("医師", panel([care], { id: "k" }));
    expect(button(careHtml, "電子署名（模擬）")).toMatch(/disabled="" title="老健・介護医療院あては送らない/);
    expect(button(careHtml, "電子で送る（模擬）")).toMatch(/disabled="" title="老健・介護医療院あては送らない/);
    expect(button(as("看護師", panel([full], { id: "a" })), "電子署名（模擬）")).toContain('disabled=""');
  });
  it("下書きの印刷には右上に「下書き」", () => {
    const draft = newLetter("d", chart, "照会", "山本（専攻医）", { day: 0, time: "10:00" });
    expect(renderToStaticMarkup(createElement(LetterDoc, { letter: draft, patient, today, doctor: "山本（専攻医）" }))).toContain(">下書き</span>");
    expect(renderToStaticMarkup(createElement(LetterDoc, { letter: done, patient, today, doctor: "山本（専攻医）" }))).not.toContain(">下書き</span>");
  });
});

describe("左の経過", () => {
  const history = (letters: Letter[]) => as("医師", createElement(HistoryPane, { patient, entries: patient.history, today, selectedDay: null, showStopped: false, onToggleStopped() {}, letters, onOpenLetter() {} }));
  it("確定した紹介状はその日時の行に【紹介状】と宛先・種類で入り、「開く」がある。開く前は本文を出さない", () => {
    const html = history([done]);
    expect(html).toContain("【紹介状】 11/7（土） 09:30");
    expect(html).toContain("架空みどり病院 循環器内科（紹介）");
    expect(html).toContain('aria-label="右の紹介状の道具で開く"');
    expect(html).not.toContain("平素より大変お世話になっております");
  });
  it("下書きは経過に出さない", () => {
    const draft = newLetter("d", chart, "照会", "山本（専攻医）", { day: 0, time: "10:00" });
    const html = history([{ ...draft, to: "下書き病院" }]);
    expect(html).not.toContain("下書き病院");
  });
});
