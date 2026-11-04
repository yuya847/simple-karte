// 日付の移動 (◀ 今日 ▶) renders on the server: the label, the range, 「今日に戻る」 and the day's counts.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AsOfBand, DayNav, dayLabel } from "./DayNav";

const fmt = (d: number) => `11/${4 + d}（水）`;

describe("DayNav", () => {
  it("today: both arrows work inside the range, no 「今日に戻る」, and the counts", () => {
    const html = renderToStaticMarkup(<DayNav day={0} min={-5} max={7} onChange={() => {}} fmtDay={fmt} counts={{ admit: 3, discharge: 0 }} />);
    expect(html).toContain("今日 11/4（水）");
    expect(html).not.toContain("今日に戻る");
    expect(html).not.toMatch(/aria-label="前の日"[^>]*disabled=""/);
    expect(html).not.toMatch(/aria-label="次の日"[^>]*disabled=""/);
    expect(html).toContain("入院 <b class=\"text-ink\">3</b>・退院 <b class=\"text-ink\">0</b>");
  });

  it("at the ends of the range the arrow is disabled; another day shows 「今日に戻る」", () => {
    const last = renderToStaticMarkup(<DayNav day={7} min={-5} max={7} onChange={() => {}} fmtDay={fmt} />);
    expect(last).toMatch(/aria-label="次の日"[^>]*disabled=""/);
    expect(last).not.toMatch(/aria-label="前の日"[^>]*disabled=""/);
    expect(last).toContain("今日に戻る");
    expect(last).toContain("11/11（水）");
    const first = renderToStaticMarkup(<DayNav day={-5} min={-5} max={7} onChange={() => {}} fmtDay={fmt} />);
    expect(first).toMatch(/aria-label="前の日"[^>]*disabled=""/);
    expect(first).not.toMatch(/aria-label="次の日"[^>]*disabled=""/);
  });

  it("labels: 今日・明日・昨日 carry the word, other days the date alone", () => {
    expect(dayLabel(0, fmt)).toBe("今日 11/4（水）");
    expect(dayLabel(1, fmt)).toBe("明日 11/5（水）");
    expect(dayLabel(-1, fmt)).toBe("昨日 11/3（水）");
    expect(dayLabel(3, fmt)).toBe("11/7（水）");
  });
});

describe("AsOfBand", () => {
  it("nothing today; a forecast band ahead with the sum as a hint; the record band back, or 「記録はありません」", () => {
    expect(renderToStaticMarkup(<AsOfBand asOf={{ day: 0, known: true }} fmtDay={fmt} />)).toBe("");
    const ahead = renderToStaticMarkup(<AsOfBand asOf={{ day: 1, known: true }} fmtDay={fmt} />);
    expect(ahead).toContain("11/5（水）の見込み（予定から計算）");
    expect(ahead).toContain("架空の病院の取り決め");
    expect(ahead).toMatch(/class="hint[^"]*"[^>]*>空床 ＝ いまの空床 ＋/);
    expect(ahead).toContain("いまの空床 ＋ 今日の退院 − 今日の入院");
    const back = renderToStaticMarkup(<AsOfBand asOf={{ day: -2, known: true }} fmtDay={fmt} />);
    expect(back).toContain("11/2（水）の記録から");
    expect(renderToStaticMarkup(<AsOfBand asOf={{ day: -9, known: false }} fmtDay={fmt} />)).toContain("この日の記録はありません");
  });
});
