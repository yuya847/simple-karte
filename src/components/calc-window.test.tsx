// 計算のウインドウ（サーバーで描く）：一覧に全部の計算と「抗菌薬の量」、最初は SOFA、カルテの値が欄に入る。
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CALCS } from "@/lib/calc/catalog";
import { icuFixture, icuPatient } from "@/lib/icu/test-fixture";
import { CalcWindow } from "./CalcWindow";
import { groupsFor } from "./ToolRail";

const today = { y: 2026, m: 11, d: 7 };
const html = (onInsert?: (line: string) => void) => renderToStaticMarkup(<CalcWindow patient={icuPatient} entries={[]} today={today} nowTime="23:00" icu={icuFixture()} onInsert={onInsert} onOpenTool={() => {}} />);

describe("計算のウインドウ", () => {
  it("一覧にすべての計算と「抗菌薬の量」があり、最初は SOFA を開く", () => {
    const h = html(() => {});
    for (const c of CALCS) expect(h).toContain(`>${c.name}</span>`);
    expect(h).toContain(">抗菌薬の量</span>");
    expect(h).toMatch(/<section aria-label="SOFA"/);
    expect(h).toContain('aria-current="true"');
  });
  it("欄にカルテ（ICU 記録）の値と記録の時刻が入り、そろえば「記事に入れる」を押せる", () => {
    const h = html(() => {});
    expect(h).toMatch(/aria-label="PaO2"[^>]*value="160"|value="160"[^>]*aria-label="PaO2"/);
    expect(h).toContain("今日 08:00");
    expect(h).toMatch(/title="SOFA \d+（呼吸\d 凝固\d 肝\d 循環\d 神経\d 腎\d）"/);
    expect(h).not.toMatch(/<button[^>]*disabled=""[^>]*title="SOFA/);
  });
  it("記事を書けない職種には「記事に入れる」を押せない", () => {
    expect(html(undefined)).toMatch(/<button[^>]*disabled=""[^>]*>.*?記事に入れる/);
  });
  it("右端の道具の介入に「計算」がある（医師・看護師）", () => {
    for (const role of ["医師", "看護師"] as const) expect(groupsFor(role).find((g) => g.key === "intervention")!.main.some((t) => t.key === "calc" && t.label === "計算")).toBe(true);
  });
});
