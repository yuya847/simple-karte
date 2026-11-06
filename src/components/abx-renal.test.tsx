import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AbxRenalWindow } from "./AbxRenalWindow";
import { AddInjectionPanel } from "./panels/AddPanels";
import { PATIENTS } from "@/lib/patients";
import { ABX_RENAL, abxInjection } from "@/lib/abx-renal";
it("患者の腎機能を表示し、薬剤は未選択で開く", () => {
  const html = renderToStaticMarkup(<AbxRenalWindow patient={PATIENTS[0]} entries={PATIENTS[0].history} today={{ y: 2026, m: 11, d: 7 }} canOrder onOrder={() => {}} onTdm={() => {}} />);
  expect(html).toContain("CCr"); expect(html).toContain("CG式"); expect(html).toContain("eGFR"); expect(html).toContain('value="" selected=""');
  expect(html).not.toContain("この量で注射オーダへ");
});
it("算出した48時間ごとの維持量が既存の注射入力で編集できる", () => {
  const item = ABX_RENAL.find(d => d.code === "622622001")!;
  const order = abxInjection(item, 19, null, null, "maintenance", { day: 2, time: "10:00" }, null)!;
  const html = renderToStaticMarkup(<AddInjectionPanel onAdd={() => {}} newId={() => "d"} drafts={[]} seed={{ key: "renal", order, start: { day: 2, time: "10:00" } }} />);
  expect(html).toContain("48時間ごと"); expect(html).toContain('value="250"'); expect(html).toContain('value="10:00"');
});
