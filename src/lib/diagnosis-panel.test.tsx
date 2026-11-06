import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DiagnosisPanel } from "@/components/panels/DiagnosisPanel";
import { DiagnosisDetail } from "@/components/panels/DiagnosisDetail";
import { INITIAL_DIAGNOSES } from "./diagnoses";
const today = {y:2026,m:11,d:6};
const d = INITIAL_DIAGNOSES["90010231"][0];
describe("病名の一覧と詳細", () => {
  it("確認は医師にだけ表示する", () => {
    const props = { diagnoses:[{...d,auto:{from:"記事" as const,at:"now"}}], today, admittedOn:-3, newId:()=>"new", onChange:()=>{} };
    const doctor = renderToStaticMarkup(<DiagnosisPanel {...props} canConfirm />);
    const other = renderToStaticMarkup(<DiagnosisPanel {...props} />);
    expect(doctor).toContain("自動（確認まだ）");
    expect(doctor).toContain(">確認</button>");
    expect(other).not.toContain(">確認</button>");
    expect(doctor).toContain(">詳細</button>");
  });
  it("未一致の病名から検索を開ける", () => {
    const html = renderToStaticMarkup(<DiagnosisPanel diagnoses={[]} today={today} admittedOn={-3} newId={()=>"new"} onChange={()=>{}} unmatched={["息切れ"]}/>);
    expect(html).toContain("息切れ");
    expect(html).toContain("病名を探す");
  });
  it("一つの病名だけに必要な欄と既存の修飾語を表示する", () => {
    const html = renderToStaticMarkup(<DiagnosisDetail initial={d} today={today} department="総合診療科" onSave={()=>{}} onClose={()=>{}} />);
    for (const label of ["接頭語", "接尾語", "主病名区分", "診療科", "入外", "保険", "開始日", "発症日", "手術日", "有効年月", "転帰日", "区分", "コメント", "登録", "閉じる", "右"]) expect(html).toContain(label);
    expect(html).toContain("下腿蜂巣炎");
    expect(html).not.toContain("ＭＲＳＡ菌血症");
  });
});
