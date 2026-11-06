import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Dockable } from "./Dockable";
import { PatientWindowProvider, WindowTray } from "./WindowTray";
it("参照ウインドウには最小化と閉じるだけがあり、位置と大きさを保つ", () => {
  const html = renderToStaticMarkup(<Dockable tab="standingcal" title="指示簿カレンダー" active={false} win={{ x: 10, y: 20, w: 700, h: 500 }} z={2} dockedClass="" onMove={() => {}} onClose={() => {}} onFront={() => {}}><input defaultValue="入力途中" /></Dockable>);
  expect(html).toContain('aria-label="最小化"');
  expect(html).toContain('aria-label="閉じる"');
  expect(html).not.toContain("右の欄に戻す");
  expect(html).toContain("left:10px;top:20px;width:700px;height:500px");
  expect(html).toContain("入力途中");
});
it("札がない行は場所を取らない", () => {
  expect(renderToStaticMarkup(<PatientWindowProvider patientKey="test"><WindowTray /></PatientWindowProvider>)).toBe("");
});
