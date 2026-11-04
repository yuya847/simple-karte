import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoleProvider, MeProvider } from "./RoleContext";
import { ConsultBanner, ConsultPanel } from "./ConsultPanel";
import type { HistoryEntry, Patient } from "@/lib/types";
const entries: HistoryEntry[] = [{ kind: "order", id: "c", day: 0, time: "10:00", author: "山本（専攻医）", status: "有効", order: { type: "procedure", code: "PROC-CONSULT", schedule: { kind: "once" }, start: { day: 0 }, consult: { dept: "循環器内科", doctor: "井上（循環器内科）", urgency: "本日中", question: "心電図の相談" } } }];
describe("コンサルトの受け手", () => {
 it("看護師には読むための印を出す", () => {
  const html = renderToStaticMarkup(createElement(RoleProvider, { value: "看護師" }, createElement(ConsultBanner, { entries, replies: {}, onOpen() {} })));
  expect(html).toContain("コンサルト中：循環器内科"); expect(html).not.toContain("返書を書く");
 });
 it("依頼先には返書への入口がある", () => {
  const html = renderToStaticMarkup(createElement(MeProvider, { value: { role: "医師", name: "井上（循環器内科）" } }, createElement(ConsultBanner, { entries, replies: {}, onOpen() {} })));
  expect(html).toContain("返書を書く"); expect(html).toContain("心電図の相談");
 });
 it("看護師の入力欄は無効", () => {
  const patient = { labs: [], imaging: [] } as unknown as Patient;
  const html = renderToStaticMarkup(createElement(RoleProvider, { value: "看護師" }, createElement(ConsultPanel, { patient, entries, consults: [], replies: {}, newId: () => "d", onAdd() {}, onReply() {}, onCloseConsult() {}, onRefer() {} })));
  expect(html).toContain('<fieldset disabled=""');
 });
});
