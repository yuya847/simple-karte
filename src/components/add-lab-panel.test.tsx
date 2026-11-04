// The lab order screen renders on the server (no browser): the category tabs in order, the items of
// the first tab, the draw choices, the sources, and the fictional-hospital note.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddLabPanel } from "./panels/AddLabPanel";

const today = { y: 2026, m: 11, d: 4 };
const newId = () => "d1";

describe("検体検査のオーダ画面", () => {
  it("shows the tabs in order, the sets first, and how to draw", () => {
    const html = renderToStaticMarkup(<AddLabPanel onAdd={() => {}} newId={newId} today={today} />);
    for (const t of ["院内セット", "血算・血液像", "凝固・線溶", "生化学", "炎症・感染症", "心筋・心不全", "内分泌", "腫瘍マーカー", "免疫・アレルギー", "血液ガス", "尿・便", "微生物", "薬物濃度", "輸血検査"]) expect(html).toContain(t);
    expect(html).toContain("入院時採血セット");
    expect(html).toContain("架空の病院の取り決め");
    expect(html).toContain("まだ項目を選んでいません");
    expect(html).toContain("今すぐ（至急）");
    expect(html).toContain("朝の定時");
    expect(html).toContain("◯回目の投与前");
    expect(html).toContain("明日 11/5（木）");
    expect(html).toContain("11/11（水）");
    expect(html).toContain("06:00");
    expect(html).toContain("SRL 総合検査案内");
    expect(html).toContain("医科診療行為マスター");
    expect(html).toContain('class="hint');
    // No recommendation: the doctor picks.
    expect(html).not.toContain("おすすめ");
    expect(html).not.toContain("推奨");
  });

  it("the 凝固 tab lists PT, APTT, PT-INR … with their full names in the button title", () => {
    const html = renderToStaticMarkup(<AddLabPanel onAdd={() => {}} newId={newId} today={today} initialTab="coag" />);
    expect(html).toContain(">PT</button>");
    expect(html).toContain(">APTT</button>");
    expect(html).toContain(">PT-INR</button>");
    expect(html).toContain(">AT III</button>");
    expect(html).toContain("PT（プロトロンビン時間。");
    expect(html).toContain("APTT（活性化部分トロンボプラスチン時間。");
    expect(html).not.toContain("PT・APTT");
  });

  it("the 血液ガス tab has the arterial and the venous item", () => {
    const html = renderToStaticMarkup(<AddLabPanel onAdd={() => {}} newId={newId} today={today} initialTab="gas" />);
    expect(html).toContain(">動脈血ガス</button>");
    expect(html).toContain(">静脈血ガス</button>");
  });

  it("the 生化学 tab has its sub-headings", () => {
    const html = renderToStaticMarkup(<AddLabPanel onAdd={() => {}} newId={newId} today={today} initialTab="chem" />);
    for (const h of ["蛋白", "肝・胆道", "腎", "電解質・微量元素", "脂質", "糖", "膵", "鉄", "ビタミン"]) expect(html).toContain(`>${h}</h3>`);
    expect(html).toContain(">Na</button>");
    expect(html).toContain(">シスタチンC</button>");
  });
});
