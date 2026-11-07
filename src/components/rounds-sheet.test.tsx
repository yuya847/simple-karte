// 回診表: the button on the patient list and the printed pages, rendered on the server without a browser.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_LIST_PREFS } from "@/lib/list-prefs";
import { PATIENTS } from "@/lib/patients";
import { paginateRounds, rowHeightMm, roundsRow } from "@/lib/rounds-sheet";
import { BEDS_WITH_CHARTS, WARD_CHART_PATIENTS } from "@/lib/ward-charts";
import { PatientListView } from "./PatientList";
import { RoundsPages } from "./RoundsSheet";

const all = [...PATIENTS, ...WARD_CHART_PATIENTS];
const ward = { beds: BEDS_WITH_CHARTS, patient: (id: string) => all.find((p) => p.id === id) };
const today = { y: 2026, m: 11, d: 8 };
const noop = () => {};
const rounds = { by: "医師 架空", surgeries: [], diagnoses: {}, onPrinted: noop };

const list = (over: Partial<Parameters<typeof PatientListView>[0]> = {}) =>
  renderToStaticMarkup(
    <PatientListView ward={ward} title="受け持ち患者" nowTime="09:00" today={today} changes={{}} summaries={{}} waiting={{}} onOpen={noop} prefs={DEFAULT_LIST_PREFS} onPrefs={noop} favorites={[]} onToggleFavorite={noop} {...over} />,
  );

describe("患者一覧の「回診表を印刷」", () => {
  it("回診表の設定があるときだけ出る", () => {
    expect(list()).not.toContain("回診表を印刷");
    expect(list({ rounds })).toContain("回診表を印刷");
  });
  it("全部出る行（受け持ち）がないときは押せない", () => {
    const html = list({ rounds, mine: () => false });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?回診表を印刷/);
  });
});

describe("回診表の紙", () => {
  const p = PATIENTS[0];
  const row = roundsRow({ patient: p, room: "506A", orders: [], todos: ["家族に病状説明"], results: { unseen: 1, panic: 1 }, today, now: "09:00" });
  const html = renderToStaticMarkup(<RoundsPages pages={paginateRounds([row], rowHeightMm)} info={{ title: "受け持ち患者", today, now: "08:12", by: "医師 架空" }} />);
  it("1人の枠に部屋・氏名・ToDo・印、右に手書きの欄と □", () => {
    expect(html).toContain("506A");
    expect(html).toContain(p.name);
    expect(html).toContain("家族に病状説明");
    expect(html).toContain("パニック値 1");
    expect(html).toContain("未確認の結果 1");
    expect(html).toContain(">メモ<");
    expect(html).toContain('aria-label="済"');
  });
  it("紙の下に印刷した人と時刻、上にページ", () => {
    expect(html).toContain("印刷 2026/11/8 08:12　医師 架空");
    expect(html).toContain("1/1");
    expect(html).not.toContain("break-after-page");
  });
});
