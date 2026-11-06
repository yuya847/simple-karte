import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SpecialistBoard } from "./SpecialistBoard";
import { groupsFor } from "./ToolRail";
import { STAFF } from "@/lib/roles";
import type { Patient } from "@/lib/types";
const patient = { id: "test", name: "テスト 太郎", room: "501", cultures: [], admissionDiagnosis: "誤嚥性肺炎", dietNow: "絶食" } as unknown as Patient;
describe("専門職の画面", () => {
  it("歯科衛生士は8項目の評価、患者のカルテ、申し送りを開ける", () => {
    const html = renderToStaticMarkup(createElement(SpecialistBoard, { screen: "oral", me: STAFF.歯科衛生士, people: [{ patient, entries: [] }], surgeryIds: ["test"], standingLines: {}, administrations: [], nowTime: "10:00", onOpen() {}, onNote() {}, onRound() {} }));
    for (const label of ["口唇", "舌", "歯肉・粘膜", "唾液", "残存歯", "義歯", "口腔清掃", "歯痛", "申し送り", "テスト 太郎", "手術予定"]) expect(html).toContain(label);
    expect(html).toContain("未評価"); expect(html).toContain("記録を保存");
    expect(html).not.toContain('<fieldset disabled=""');
  });
  it("医師は専用画面の記録を変更できない", () => {
    const html = renderToStaticMarkup(createElement(SpecialistBoard, { screen: "oral", me: STAFF.医師, people: [{ patient, entries: [] }], surgeryIds: [], standingLines: {}, administrations: [], nowTime: "10:00", onOpen() {}, onNote() {}, onRound() {} }));
    expect(html).toContain('<fieldset disabled=""');
  });
  it("3職種とも結果参照・記事と灰色にするオーダのタイルがある", () => {
    for (const role of ["臨床工学技士", "ICT", "歯科衛生士"]) {
      const keys = groupsFor(role).flatMap(g => [...g.main, ...g.more]).map(t => t.key);
      expect(keys).toContain("results"); expect(keys).toContain("templates"); expect(keys).toContain("add-rx");
    }
  });
});
