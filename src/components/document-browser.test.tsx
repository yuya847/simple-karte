import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DocumentBrowser } from "./DocumentBrowser";
import { ConsentDocument } from "./panels/ConsentPanel";
import { DOCUMENT_CATALOG } from "@/lib/document-catalog";
import { PROCEDURE_CONSENTS } from "@/lib/consent-procedures";
import { PATIENTS } from "@/lib/patients";

it("検索と7分類を上に置き、作る行を小さく表示する", () => {
  const html = renderToStaticMarkup(createElement(DocumentBrowser, { items: DOCUMENT_CATALOG, actor: "医師", onCreate: () => {} }));
  expect(html).toContain('aria-label="書類を検索"');
  expect(html.indexOf('type="search"')).toBeLessThan(html.indexOf("診断書・証明書"));
  expect(html).toContain("お気に入りにする");
  expect(html).toContain("死亡診断書");
  expect(html).not.toContain("出典");
});
it("全追加同意書を説明書として印刷でき、説明者・日時・同席者・両署名欄を持つ", () => {
  for (const t of PROCEDURE_CONSENTS) {
    const html = renderToStaticMarkup(createElement(ConsentDocument, {
      r: { id: "x", patientId: PATIENTS[0].id, code: t.code, status: "説明前", answers: {}, createdAt: { day: 0, time: "09:00" }, details: { "部位": "右膝" } },
      patient: PATIENTS[0], room: "101", today: { y: 2026, m: 11, d: 5 }, orders: [], print: true,
    }));
    for (const label of [t.title, "説明日時", "説明した医師", "同席者", "本人署名", "代諾者", "同意の撤回"]) expect(html, t.code).toContain(label);
    if (t.fields?.includes("部位")) expect(html).toContain("右膝");
  }
});

it("説明書だけを印刷するときは署名の同意欄を外す", () => {
  const html = renderToStaticMarkup(createElement(ConsentDocument, {
    r: { id: "x", patientId: PATIENTS[0].id, code: "CONSENT-SURGERY", status: "説明前", answers: {}, createdAt: { day: 0, time: "09:00" } },
    patient: PATIENTS[0], room: "101", today: { y: 2026, m: 11, d: 5 }, orders: [], print: true, explanation: true,
  }));
  expect(html).toContain("手術一般の説明書");
  expect(html).toContain("主な合併症");
  expect(html).not.toContain("本人署名");
});
