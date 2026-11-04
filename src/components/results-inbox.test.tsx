// 未確認の結果 in the chart renders on the server: a panic value's 対応 field takes its own full line.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ResultItem } from "@/lib/results";
import { RoleProvider } from "./RoleContext";
import { ResultsInbox } from "./ResultsInbox";

const today = { y: 2026, m: 11, d: 4 };
const plain: ResultItem = { key: "r1", patientId: "p1", kind: "検査", day: 0, time: "09:10", title: "血算", detail: "WBC 11.2 ↑", panic: [] };
const panic: ResultItem = { key: "r2", patientId: "p1", kind: "検査", day: 0, time: "09:12", title: "生化学", detail: "", panic: [{ code: "K", name: "K", value: 6.8, unit: "mmol/L", side: "高", limit: 6.0 }] };
const render = (items: ResultItem[]) =>
  renderToStaticMarkup(
    <RoleProvider value="医師">
      <ResultsInbox today={today} items={items} calls={{}} onSeen={() => {}} />
    </RoleProvider>,
  );

describe("未確認の結果：対応の入力欄", () => {
  it("the 対応 field of a panic value is on its own full-width line and stretches (flex-1 min-w-0), with a short placeholder", () => {
    const html = render([panic, plain]);
    const row = html.match(/<span class="[^"]*w-full[^"]*">(<input[^>]*aria-label="パニック値への対応"[^>]*>)/);
    expect(row, "the field sits in a full-width line").toBeTruthy();
    expect(row![0]).toContain("flex-wrap");
    expect(row![1]).toContain("min-w-0 flex-1");
    expect(row![1]).toContain('placeholder="対応（例：主治医に報告・指示変更）"');
    expect(html).not.toContain("記事に入ります）例");
    expect(html).toMatch(/<button[^>]*class="shrink-0 [^"]*bg-shu[^"]*"[^>]*>対応を記録して確認<\/button>/);
    expect(html).toContain("パニック値 1件");
  });

  it("a plain result keeps its one-line 確認した button", () => {
    const html = render([plain]);
    expect(html).toContain(">確認した</button>");
    expect(html).not.toContain("パニック値への対応");
  });
});
