// The lab order screen renders on the server (no browser): three columns (sets left, tabs and items in
// the middle, the picks right), the tabs in order with 頻用 first, the items as a table with their
// turnaround, the comment fields, the band at the bottom (when to draw, 至急, comment, 保存), the
// sources and the fictional-hospital note.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddLabPanel } from "./panels/AddLabPanel";

const today = { y: 2026, m: 11, d: 4 };
const newId = () => "d1";

describe("検体検査のオーダ画面", () => {
  const html = renderToStaticMarkup(<AddLabPanel onAdd={() => {}} newId={newId} today={today} />);

  it("shows the tabs in the manual's order with 頻用 first, and the search at the end of the tab row", () => {
    const labels = ["頻用", "生化学Ⅰ", "生化学Ⅱ", "血液学・凝固系", "血清学・免疫", "尿・髄液・便", "微生物", "輸血関連", "薬物濃度", "腫瘍マーカー", "内分泌", "感染症（ウイルスを含む）", "アレルギー", "その他"];
    let pos = -1;
    for (const t of labels) {
      const i = html.indexOf(`>${t}</button>`);
      expect(i, t).toBeGreaterThan(pos);
      pos = i;
    }
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('placeholder="項目検索"');
    // The same tab look as the rest of the app.
    expect(html).toContain("bg-ink font-bold text-white");
  });

  it("has three columns: sets on the left (基本セット・科別セット), the picks on the right", () => {
    expect(html).toContain("@3xl:grid-cols-[10rem_minmax(0,1fr)_18rem]");
    expect(html).toContain(">基本セット<");
    expect(html).toContain(">科別セット<");
    expect(html).toContain("入院時採血セット");
    expect(html).toContain("生化学セット");
    for (const d of ["総合診療科", "循環器内科", "消化器内科", "呼吸器内科", "整形外科"]) expect(html).toContain(d);
    expect(html).toContain("心不全セット");
    expect(html).toContain("術前セット");
    expect(html).toContain(">選択中の検査項目<");
    expect(html).toContain(">0件<");
    expect(html).toContain("まだ項目を選んでいません");
    for (const b of ["選択削除", "全削除", "重複削除", "全項目至急", "全項目至急解除"]) expect(html).toContain(`>${b}<`);
  });

  it("頻用 lists 血算・CRP・Na … 動脈血ガス as a table of buttons with the turnaround, rapid items in red", () => {
    expect(html).toContain("@md:grid-cols-3");
    expect(html).toContain(">血算</span>");
    expect(html).toContain(">CRP</span>");
    expect(html).toContain(">Na</span>");
    expect(html).toContain(">動脈血ガス</span>");
    expect(html).toContain(">院内・当日</span>");
    expect(html).toContain(">院内・すぐ</span>");
    expect(html).toContain("text-shu");
    expect(html).toContain("迅速対応");
  });

  it("has the comment fields: where to draw (病棟採血 is the default), the purpose, the comment combo box", () => {
    expect(html).toContain("採血場所指示");
    for (const s of ["中央採血室", "自科採血", "病棟採血"]) expect(html).toContain(`value="${s}"`);
    expect(html).toMatch(/checked="" value="病棟採血"/);
    expect(html).toContain("検査目的");
    // A select of the ward's usual comments (採取の時刻の指定もここ) plus 自由に書く.
    expect(html).toContain('aria-label="依頼コメント（候補）"');
    expect(html).toContain('value="薬剤投与の30分前に採取（トラフ）"');
    expect(html).toContain('value="ヘパリンロックから採取"');
    expect(html).toContain("自由に書く…");
  });

  it("the band at the bottom: when to draw, 至急, the comment, then 保存 (not 保存する)", () => {
    const band = html.slice(html.indexOf("sticky bottom-0"));
    // 日時を選ぶ is the default (tomorrow at the routine time); 投与前 is written as a comment, not a mode.
    for (const s of ["今すぐ（至急）", "朝の定時", "日時を選ぶ", "明日 11/5（木）", "11/11（水）", "06:00", "至急", "コメント", "保存（0項目・採取 11/5（木） 06:00（定時））"]) expect(band).toContain(s);
    expect(band).not.toContain("◯回目の投与前");
    expect(band.indexOf("朝の定時")).toBeLessThan(band.indexOf('type="checkbox"'));
    expect(band.indexOf('type="checkbox"')).toBeLessThan(band.indexOf("依頼コメント（候補）"));
    expect(band.indexOf("依頼コメント（候補）")).toBeLessThan(band.indexOf("保存（"));
    expect(html).not.toContain("保存する");
  });

  it("names the sources and the fictional-hospital rules as hints, and suggests nothing", () => {
    expect(html).not.toContain("SRL 総合検査案内");
    expect(html).not.toContain("医科診療行為マスター");
    expect(html).not.toContain("公開されている操作マニュアルの画面を参考");
    expect(html).not.toContain("https://www.med.miyazaki-u.ac.jp/");
    expect(html).not.toContain("架空の病院の取り決め");
    expect(html).not.toContain('class="hint');
    expect(html).not.toContain("おすすめ");
    expect(html).not.toContain("推奨");
  });

  it("the 血液学・凝固系 tab lists PT, APTT, PT-INR … with their full names in the button title", () => {
    const h = renderToStaticMarkup(<AddLabPanel onAdd={() => {}} newId={newId} today={today} initialTab="heme" />);
    for (const s of ["WBC", "PT", "APTT", "PT-INR", "AT III"]) expect(h).toContain(`>${s}</span>`);
    expect(h).toContain("PT（プロトロンビン時間。");
    expect(h).toContain("APTT（活性化部分トロンボプラスチン時間。");
    expect(h).not.toContain(">PT・APTT<");
    expect(h).toContain(">凝固・線溶</h3>");
  });

  it("the その他 tab has the arterial and the venous blood gas", () => {
    const h = renderToStaticMarkup(<AddLabPanel onAdd={() => {}} newId={newId} today={today} initialTab="other" />);
    expect(h).toContain(">動脈血ガス</span>");
    expect(h).toContain(">静脈血ガス</span>");
  });

  it("the 生化学Ⅰ tab has its sub-headings; 生化学Ⅱ the vitamins", () => {
    const h = renderToStaticMarkup(<AddLabPanel onAdd={() => {}} newId={newId} today={today} initialTab="chem1" />);
    for (const s of ["蛋白", "肝・胆道", "腎", "電解質・微量元素", "脂質", "糖", "膵", "鉄", "炎症マーカー", "心筋"]) expect(h).toContain(`>${s}</h3>`);
    expect(h).toContain(">Na</span>");
    expect(h).toContain(">外注・2〜4日</span>");
    const h2 = renderToStaticMarkup(<AddLabPanel onAdd={() => {}} newId={newId} today={today} initialTab="chem2" />);
    expect(h2).toContain(">ビタミン</h3>");
    expect(h2).toContain(">シスタチンC</span>");
  });
});

it("救急は今すぐを選び、その他タブは同じパネル内だけに関連づく", () => {
  const html = renderToStaticMarkup(<AddLabPanel patientId="er:er-3" initialTab="other" onAdd={() => {}} newId={newId} today={today} />);
  expect(html).toContain("救急初療セット");
  expect(html).toMatch(/aria-checked="true"[^>]*>今すぐ（至急）</);
  const panel = html.match(/id="([^"]+)" role="tabpanel" aria-labelledby="([^"]+)"/)!;
  expect(panel).toBeTruthy();
  expect(html).toContain(`id="${panel[2]}" role="tab" aria-controls="${panel[1]}"`);
  expect(html).not.toContain("aria-describedby");
});
