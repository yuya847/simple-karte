// The imaging order screen renders on the server (no browser): the modalities, the groups of the body,
// the regions of the first group, the search box, and the notes (hint). Nothing is suggested.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddImagingPanel } from "./panels/AddImagingPanel";

const newId = () => "d1";

describe("画像検査のオーダ画面", () => {
  it("種類・部位の区分・体幹の部位・検索の欄・使い方（hint）が出る", () => {
    const html = renderToStaticMarkup(<AddImagingPanel onAdd={() => {}} newId={newId} />);
    for (const m of ["X線", "ポータブルX線", "CT", "MRI"]) expect(html).toContain(`>${m}</button>`);
    for (const g of ["頭頸部", "体幹", "脊椎", "上肢", "下肢"]) expect(html).toContain(g);
    for (const r of ["胸部", "肋骨", "腹部", "骨盤"]) expect(html).toContain(r);
    // 上肢の部位は体幹のタブでは出ない（タブを押すと出る）
    expect(html).not.toContain("手関節</button>");
    expect(html).toContain("部位を検索");
    expect(html).toContain("目的（臨床診断・知りたいこと）");
    expect(html).toContain("部位を選ぶ）");
    expect(html).toMatch(/class="hint[^"]*"[^>]*>部位を選ぶと、マスターの標準の方向と体位が入ります/);
    expect(html).toContain("一般撮影で広く使われる呼称");
    expect(html).not.toContain("おすすめ");
    expect(html).not.toContain("推奨");
  });
});

it("救急外来では今すぐ（至急）を先頭に出し既定にする", () => {
  const html = renderToStaticMarkup(<AddImagingPanel patientId="er-1" onAdd={() => {}} newId={newId} />);
  expect(html.indexOf("今すぐ（至急）")).toBeLessThan(html.indexOf("日時を選ぶ"));
  expect(html).toMatch(/aria-checked="true"[^>]*>今すぐ（至急）/);
});

 it("予約はカレンダーと空き枠を表示する", () => {
  const html = renderToStaticMarkup(<AddImagingPanel today={{ y: 2026, m: 11, d: 5 }} onAdd={() => {}} newId={newId} />);
  expect(html).toContain("2026年11月");
  expect(html).toContain("08:30 空き");
  expect(html).not.toContain("架空の病院の取り決め");
  expect(html).toContain("ほかの患者の名前は予約の調整のために出しています");
  expect(html).toMatch(/aria-checked="true"[^>]*>日時を選ぶ/);
});
