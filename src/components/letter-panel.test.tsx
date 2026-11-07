import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoleProvider } from "./RoleContext";
import { LetterPanel } from "./panels/LetterPanel";
import { LetterDoc } from "./LetterDoc";
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
  it("下書きの印刷には右上に「下書き」", () => {
    const draft = newLetter("d", chart, "照会", "山本（専攻医）", { day: 0, time: "10:00" });
    expect(renderToStaticMarkup(createElement(LetterDoc, { letter: draft, patient, today, doctor: "山本（専攻医）" }))).toContain(">下書き</span>");
    expect(renderToStaticMarkup(createElement(LetterDoc, { letter: done, patient, today, doctor: "山本（専攻医）" }))).not.toContain(">下書き</span>");
  });
});
