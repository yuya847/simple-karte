// The 指示簿カレンダー, the 指示の行 of the 指示簿 panel and the printed 指示簿 render (on the server, without a browser).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { initialStanding } from "@/lib/standing";
import { initialLines, linesFromFields } from "@/lib/standing-lines";
import { StandingLines, StandingPrintSheet } from "./panels/StandingLines";
import { StandingPanel } from "./panels/StandingPanel";
import { RoleProvider } from "./RoleContext";
import { StandingCalendar } from "./StandingCalendar";

const TODAY = { y: 2026, m: 11, d: 4 };
const oura = PATIENTS.find((p) => p.id === "90010198")!;
const noop = () => {};
let n = 0;
const id = () => `x${++n}`;

describe("指示簿の画面", () => {
  it("the calendar shows each line as a row under its category, the stop where it was stopped, and today's column", () => {
    const lines = [...initialLines()["90010198"], ...linesFromFields(initialStanding()["90010198"])];
    const html = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <StandingCalendar patient={oura} lines={lines} today={TODAY} nowTime="10:30" onStop={noop} />
      </RoleProvider>,
    );
    expect(html).toContain("指示簿カレンダー");
    expect(html).toContain("安静度：ベッド上、頭を上げてよい");
    expect(html).toContain("中止 09:00");
    expect(html).toContain("安静度：病棟内フリー（息切れが出たら休む）");
    expect(html).toContain("今日 10:30");
    // Lines from the 項目で選ぶ fields are on the calendar too.
    expect(html).toContain("バイタル測定：1日3回");
    expect(html).toContain("医師を呼ぶ：");
    // The category rows come in the hospital's order: 安静 before 観察 before 処置.
    expect(html.indexOf("弾性ストッキング")).toBeGreaterThan(html.indexOf("体重が前日より"));
  });

  it("the lines section lists the lines in force, the history, and the templates; a nurse cannot add or stop", () => {
    const html = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <StandingLines patient={oura} lines={initialLines()["90010198"]} fields={initialStanding()["90010198"][0]} today={TODAY} nowTime="10:30" onAdd={noop} onStop={noop} newId={id} />
      </RoleProvider>,
    );
    expect(html).toContain("指示の行（3）");
    expect(html).toContain("終わった行・中止した行（1）");
    expect(html).toContain("息切れが落ち着いた");
    expect(html).toContain("テンプレート（院内");
    expect(html).toContain("架空の病院の取り決め");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>＋ 行を足す<\/button>/);
  });

  it("the 指示簿 panel shows blocks beside a title and body form", () => {
    const html = renderToStaticMarkup(
      <RoleProvider value="医師">
        <StandingPanel versions={initialStanding()["90010198"]} allergies={[]} nowTime="10:30" fmtDay={(d) => `11/${4 + d}`} onSave={noop} onTake={noop} newId={id} lines={{ patient: oura, lines: initialLines()["90010198"], today: TODAY, onAdd: noop, onStop: noop }} />
      </RoleProvider>,
    );
    expect(html).toContain('aria-label="現在の指示"');
    expect(html).toContain('aria-label="指示の入力"');
    expect(html).not.toContain('aria-label="指示のカテゴリ"');
    expect(html).not.toContain('aria-label="指示の選択肢"');
    expect(html).toMatch(/<textarea[^>]*aria-label="指示の見出しと本文"/);
    expect(html).toContain("項目で入力（任意）");
    expect(html).toContain("テンプレート");
    expect(html).toContain("有効");
    expect(html).toContain("中止");
    expect(html).toContain("指示簿を印刷（A4 縦）");
    expect(html).toContain("指示簿を変える");
  });

  it("the printed 指示簿 (A4 portrait) has the patient, the lines in force and the fields", () => {
    const html = renderToStaticMarkup(<StandingPrintSheet patient={oura} lines={initialLines()["90010198"].filter((l) => !l.stop)} fields={initialStanding()["90010198"][0]} today={TODAY} nowTime="10:30" by="山本（専攻医）" />);
    expect(html).toContain("指示簿（約束指示）");
    expect(html).toContain(oura.name);
    expect(html).toContain("ID 90010198");
    expect(html).toContain("安静度：病棟内フリー（息切れが出たら休む）");
    expect(html).not.toContain("頭を上げてよい");
    expect(html).toContain("項目で選んだ指示");
    expect(html).toContain("架空の病院の取り決め");
  });
});
