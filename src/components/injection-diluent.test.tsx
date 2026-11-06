import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InjectionDiluentChoice } from "./panels/InjectionDiluentChoice";
it("溶解の札は初めは未選択で数字付きの選択肢を表示する", () => {
  const html = renderToStaticMarkup(<InjectionDiluentChoice volumes={[50, 100]} onChoose={() => {}} />);
  expect(html).toContain("溶解：生食 50mL を入れますか？");
  expect(html.match(/aria-checked="false"/g)).toHaveLength(3);
  expect(html).toContain("入れない");
  expect(html).toContain('opacity-50">3</span>');
  expect(renderToStaticMarkup(<InjectionDiluentChoice volumes={[]} onChoose={() => {}} />)).toBe("");
});

import { AddInjectionPanel } from "./panels/AddPanels";
import type { InjectionOrder } from "@/lib/types";
it("注射入力の薬の直下に札が出て、輸液のあるRpでは出ない", () => {
  const order: InjectionOrder = { type: "injection", items: [{ drugCode: "INJ-CEZ1", amount: 1, unit: "g" }], route: "点滴静注", schedule: { kind: "per_day", count: 2 }, minutesPerDose: 60, start: { day: 0, time: "10:00" }, days: 1 };
  const render = (o: InjectionOrder) => renderToStaticMarkup(<AddInjectionPanel onAdd={() => {}} newId={() => "d"} drafts={[]} seed={{ key: "test", order: o, start: { day: 0, time: "10:00" } }} />);
  expect(render(order)).toContain('溶解：生食 50mL');
  expect(render({ ...order, items: [...order.items, { drugCode: "INJ-NS100", amount: 1, unit: "本" }] })).not.toContain('溶解：生食');
});
