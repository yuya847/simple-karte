// 「表示」 (columns and row height) and ☆ (お気に入り) on the patient list, and the お気に入りの患者 screen, rendered
// on the server without a browser.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_LIST_PREFS, LIST_COLUMNS } from "@/lib/list-prefs";
import { PATIENTS } from "@/lib/patients";
import { BEDS_WITH_CHARTS, WARD_CHART_PATIENTS } from "@/lib/ward-charts";
import { FavoriteList } from "./FavoritePatients";
import { PatientListView } from "./PatientList";

const all = [...PATIENTS, ...WARD_CHART_PATIENTS];
const ward = { beds: BEDS_WITH_CHARTS, patient: (id: string) => all.find((p) => p.id === id) };
const team = new Set(PATIENTS.map((p) => p.id));
const mine = (id: string) => team.has(id);
const noop = () => {};

const list = (over: Partial<Parameters<typeof PatientListView>[0]> = {}) =>
  renderToStaticMarkup(
    <PatientListView ward={ward} title="患者一覧" nowTime="10:00" changes={{}} summaries={{}} waiting={{}} mine={mine} onOpen={noop} prefs={DEFAULT_LIST_PREFS} onPrefs={noop} favorites={[]} onToggleFavorite={noop} {...over} />,
  );

describe("患者一覧の「表示」", () => {
  it("shows every column by default, with the 表示 button", () => {
    const html = list();
    for (const c of LIST_COLUMNS) expect(html).toContain(c.key === "day" ? ">入院<" : c.label);
    expect(html).toContain("表示</button>");
    expect(html).toContain("min-w-[1180px]");
    // The full rows carry the vitals and the kana line.
    expect(html).toContain("SpO2 ");
    expect(html).toContain(PATIENTS[0].kana);
    expect(html).toContain('colSpan="5"');
  });

  it("drops a column's heading and cells when it is turned off, and says how many are shown", () => {
    const html = list({ prefs: { hidden: ["vitals", "dpc"], density: "normal" } });
    expect(html).not.toContain("最新バイタル");
    expect(html).not.toContain("SpO2 ");
    expect(html).not.toContain(">DPC<");
    expect(html).not.toContain("計算中");
    expect(html).toContain("印（記録から）");
    expect(html).toContain(`表示（${LIST_COLUMNS.length - 2}/${LIST_COLUMNS.length}列）`);
    expect(html).not.toContain("min-w-[1180px]");
    // The gray rows' note spans the columns after 診療科・担当 that are still shown (印・このあと・結果・指示: 4, not 5).
    expect(html).toContain('colSpan="4"');
    expect(html).not.toContain('colSpan="5"');
  });

  it("つめる: no avatar and no kana line in the rows, tighter cells", () => {
    const html = list({ prefs: { hidden: [], density: "compact" } });
    expect(html).not.toContain(PATIENTS[0].kana);
    expect(html).toContain("px-3 py-0.5");
    expect(html).not.toContain("px-3 py-2 font-bold");
  });

  it("☆: a starred patient's row says it can be unstarred, the others that they can be starred; お気に入りだけ is a condition", () => {
    const html = list({ favorites: [PATIENTS[0].id] });
    expect(html).toContain(`${PATIENTS[0].name}をお気に入りから外す`);
    expect(html).toContain(`${PATIENTS[1].name}をお気に入りに登録`);
    // The gray rows (other teams) have a star too.
    const other = WARD_CHART_PATIENTS[0];
    expect(html).toContain(`${other.name}をお気に入りに登録`);
    expect(html).toContain("お気に入り順");
  });

  it("お気に入り順: the starred patients come first under their own heading", () => {
    const html = list({ favorites: [PATIENTS[1].id], defaultGroup: "favorite" });
    const fav = html.indexOf("お気に入り<span");
    const rest = html.indexOf("そのほか<span");
    expect(fav).toBeGreaterThan(-1);
    expect(rest).toBeGreaterThan(fav);
    expect(html.indexOf(PATIENTS[1].kana)).toBeLessThan(rest);
    expect(html.indexOf(PATIENTS[0].kana)).toBeGreaterThan(rest);
  });
});

describe("お気に入りの患者の画面", () => {
  it("lists the starred patients from every ward with room, age, diagnosis and marks; the others are not there", () => {
    const a = PATIENTS[0];
    const b = WARD_CHART_PATIENTS[0];
    const html = renderToStaticMarkup(<FavoriteList ids={[b.id, a.id, "gone"]} onToggle={noop} patient={ward.patient} nowTime="10:00" changes={{}} onOpen={noop} />);
    expect(html).toContain("お気に入りの患者");
    expect(html).toContain("2人");
    expect(html).toContain(a.name);
    expect(html).toContain(b.name);
    expect(html).toContain(b.room);
    expect(html).toContain(`入院時：${a.admissionDiagnosis}`);
    expect(html).toContain(`${a.name}をお気に入りから外す`);
    expect(html).not.toContain(PATIENTS[1].name);
    expect(html).toContain("いまの患者にいない 1人");
    expect(html).toContain("この端末のみ");
    // Newest first: b was starred after a.
    expect(html.indexOf(b.name)).toBeLessThan(html.indexOf(a.name));
  });

  it("says so when nothing is starred", () => {
    const html = renderToStaticMarkup(<FavoriteList ids={[]} onToggle={noop} patient={ward.patient} nowTime="10:00" changes={{}} onOpen={noop} />);
    expect(html).toContain("まだお気に入りはありません");
  });
});
