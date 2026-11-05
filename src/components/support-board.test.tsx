import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SupportBoard } from "./SupportBoard";
import { RoleProvider } from "./RoleContext";
import { PATIENTS } from "@/lib/patients";
import type { WorkPatient } from "@/lib/worksheet";

it("MSWの一覧は未着手の各段階をボタンにし、退院オーダだけを無効にする", () => {
  const patient = PATIENTS[0];
  const html = renderToStaticMarkup(createElement(RoleProvider, { value: "MSW" }, createElement(SupportBoard, {
    people: [{ patient, room: "101", entries: [] } as unknown as WorkPatient], evals: {}, documents: [], asks: [],
    today: { y: 2026, m: 11, d: 5 }, discharged: {}, onOpen: () => {}, onStep: () => {},
  })));
  expect(html.match(/<button /g)).toHaveLength(8);
  expect(html.match(/disabled=""/g)).toHaveLength(1);
  expect(html).toContain('title="医師が出します"');
  expect(html.match(/>まだ</g)).toHaveLength(7);
  for (const label of ["退院困難な要因", "話合い", "計画の着手", "カンファレンス", "退院支援計画書", "転院・施設", "退院"]) {
    expect(html).toContain(`aria-label="${patient.name}：${label}"`);
  }
});
