// The nursing-management screens render (on the server, without a browser) from the fictional record.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { roomNurses } from "@/lib/assignments";
import { PATIENTS } from "@/lib/patients";
import { initialUlcers } from "@/lib/pressure-course";
import { WARD_NURSES } from "@/lib/roster";
import { ROOMS } from "@/lib/ward";
import { BEDS_WITH_CHARTS, WARD_CHART_PATIENTS } from "@/lib/ward-charts";
import { initialEvals } from "@/lib/admit-eval";
import { initialSummaries } from "@/lib/nursing-summary";
import { screenHelp } from "@/lib/help/content";
import { FallBoard } from "./FallBoard";
import { VitalsBulk } from "./VitalsBulk";
import { AssignBoard } from "./AssignBoard";
import { PressurePanel } from "./panels/PressurePanel";
import { SummaryPanel } from "./panels/SummaryPanel";
import { RoleProvider } from "./RoleContext";
import { SummaryApprovals } from "./SummaryApprovals";
import { WardMap } from "./WardMap";
import { StatusBoard } from "./StatusBoard";
import { UlcerBoard } from "./UlcerBoard";

const where = (pid: string) => {
  const b = BEDS_WITH_CHARTS.find((x) => x.patientId === pid);
  const p = WARD_CHART_PATIENTS.find((x) => x.id === pid);
  return b && p ? { name: p.name, room: `${b.room}${b.bed}` } : undefined;
};
const pick = { label: "階", value: "5階東病棟", options: [{ value: "5階東病棟", label: "5階東病棟" }], onChange: () => {} };
const fmtDay = (d: number) => `D${d}`;

describe("バイタルの一括入力", () => {
  const patients = PATIENTS.map((p) => ({ id: p.id, name: p.name, room: p.room, last: p.vitals.at(-1) }));
  it("starts on 自分の受け持ち when the plan gives some, with the last values and the sources of the warnings", () => {
    const html = renderToStaticMarkup(<VitalsBulk pick={pick} patients={patients} mine={[patients[0].id]} team={patients.map((p) => p.id)} nowTime="10:00" canType onSave={() => {}} />);
    expect(html).toMatch(/aria-checked="true"[^>]*>業務分担で自分の受け持ち（1人）/);
    expect(html.match(/の体温"/g)?.length).toBe(1);
    expect(html).toContain("入れた 0人分を確定");
    // 前回 is pressed to copy it into the empty boxes; Enter／↓ goes to the same box of the next patient.
    expect(html).toContain(`aria-label="${patients[0].name}の前回の値を写す"`);
    expect(html).toContain('data-bulk-row="0" data-bulk-field="bt"');
    expect(html).not.toContain("Royal College of Physicians");
    expect(html).not.toContain("指示簿");
  });

  it("without a plan it starts on the team; a viewer who may not record cannot type", () => {
    const html = renderToStaticMarkup(<VitalsBulk pick={pick} patients={patients} mine={[]} team={patients.map((p) => p.id)} nowTime="10:00" canType={false} onSave={() => {}} />);
    expect(html).toMatch(/aria-checked="true"[^>]*>受け持ちのチーム（4人）/);
    expect(html).toMatch(/disabled=""[^>]*>業務分担で自分の受け持ち（0人）/);
    expect(html).not.toContain("人分を確定");
    expect(html).not.toContain("の前回の値を写す");
  });
});

describe("転倒・転落の再評価", () => {
  it("lists the team's patients due first, with the reasons and the sources; no score", () => {
    const evals = initialEvals();
    const patients = PATIENTS.map((p) => ({ id: p.id, name: p.name, room: p.room, admittedOn: p.admittedOn, first: evals.find((e) => e.patientId === p.id)?.fall, reviews: [], triggers: p.id === "90010231" ? [{ at: { day: 0, time: "09:00" }, label: "転床 512→515-C", kind: "転棟・転床" as const }] : [] }));
    const html = renderToStaticMarkup(<FallBoard patients={patients} nowTime="10:00" canRecord onReview={() => {}} onOpen={() => {}} />);
    // 大浦 has no first assessment: due on the admission day (yesterday), first.
    expect(html.indexOf("大浦 トメ")).toBeLessThan(html.indexOf("北村 博"));
    expect(html).toContain("入院時の評価がまだです");
    expect(html).toContain("転棟・転床のあと（転床 512→515-C）");
    expect(html).toContain("再評価する");
    expect(html).not.toContain("提言7");
    expect(html).not.toContain("点数の票は使いません");
    expect(html).not.toMatch(/危険度Ⅰ|合計点/);
  });
});

describe("看護サマリの提出と承認", () => {
  const sugawara = WARD_CHART_PATIENTS.find((p) => p.name === "菅原 洋子")!;
  const fujii = WARD_CHART_PATIENTS.find((p) => p.name === "藤井 さよ")!;
  const patients = [sugawara, fujii].map((p) => ({ id: p.id, name: p.name, room: p.room, admittedOn: p.admittedOn }));

  it("the 看護師長's screen: the fictional 中間サマリ waiting, the approve and return controls, and the overdue 中間サマリ", () => {
    const html = renderToStaticMarkup(<SummaryApprovals pick={pick} patients={patients} summaries={initialSummaries()} canReview onApprove={() => {}} onReturn={() => {}} onOpen={() => {}} />);
    expect(html).toContain("承認待ち（1件）");
    expect(html).toContain("中間サマリ");
    expect(html).toContain("承認（看護師長 小松）");
    expect(html).toContain("差し戻す");
    // 藤井（入院21日目）has no 中間サマリ: overdue.
    expect(html).toMatch(/藤井 さよ<\/button><\/td><td class="px-2">入院21日目/);
    expect(html).toContain("期限切れ");
    // The rules, the demo note and the guideline are in the help, not on the screen.
    expect(html).not.toContain("確定者");
    expect(html).not.toContain("デモでは看護師で開けます");
    const help = JSON.stringify(screenHelp.find((h) => h.id === "SummaryApprovals"));
    expect(help).toContain("確定者");
    expect(help).toContain("デモでは看護師で開けます");
  });

  it("a returned summary shows the comment; a viewer who may not review sees no buttons", () => {
    const [s] = initialSummaries();
    const back = { ...s, events: [...s.events, { kind: "差し戻し" as const, by: "看護師長 小松", at: { day: 0, time: "09:00" }, comment: "食事の量を書いてください" }] };
    const html = renderToStaticMarkup(<SummaryApprovals pick={pick} patients={patients} summaries={[back]} canReview={false} onApprove={() => {}} onReturn={() => {}} onOpen={() => {}} />);
    expect(html).toContain("差し戻し中（1件）");
    expect(html).toContain("食事の量を書いてください");
    expect(html).not.toContain("承認（看護師長 小松）");
  });

  it("a nurse's summary panel offers the kinds and hands in to the 看護師長; others keep 連携サマリ", () => {
    const [s] = initialSummaries();
    const nursing = { summaries: [s], onSubmit: () => {} };
    const html = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <SummaryPanel patient={sugawara} facts={[{ heading: "病名", lines: [""] }]} today="11/4" nowTime="10:00" onSave={() => {}} nursing={nursing} />
      </RoleProvider>,
    );
    expect(html).toContain("中間サマリ");
    expect(html).toContain("退院・転院時");
    expect(html).toContain("この患者の看護サマリ");
    expect(html).toContain("承認待ち");
    expect(html).toContain("看護サマリを看護師長に提出");
    const doc = renderToStaticMarkup(<SummaryPanel patient={sugawara} facts={[]} today="11/4" nowTime="10:00" onSave={() => {}} nursing={nursing} />);
    expect(doc).toContain("連携サマリを確定");
    expect(doc).not.toContain("看護師長に提出");
  });
});

describe("業務分担", () => {
  const nurses = WARD_NURSES;
  const crew = nurses.filter((n) => ["n-tanaka", "n-ito", "n-inoue"].includes(n.id));
  const beds = [
    { key: "512", patientId: "p1", name: "佐倉 修" },
    { key: "515B", patientId: "p2", name: "大浦 トメ" },
  ];
  const rooms = ROOMS.filter((r) => ["512", "515"].includes(r.no));
  const plan = { beds: { "512": "n-tanaka", "515B": "n-inoue" }, directs: {}, changes: [{ at: { day: 0, time: "11:00" }, by: "看護師 佐藤", bed: "515B", patient: "大浦 トメ", from: "看護師 田中", to: "准看護師 井上", reason: "入院の受け入れ" }], confirmed: { by: "看護師 佐藤", at: { day: 0, time: "08:45" } } };

  it("shows the shift's nurses from the roster, each bed's nurse, the checks, the number to post and the change log", () => {
    const html = renderToStaticMarkup(<AssignBoard pick={pick} hasRoster rooms={rooms} beds={beds} nurses={nurses} crewOf={() => crew} sheetOf={(d, s) => (d === 0 && s === "day" ? plan : undefined)} nowTime="10:00" canEdit onChange={() => {}} />);
    expect(html).toContain("<b>田中</b>");
    expect(html).toContain("<b>井上</b>");
    expect(html).toContain("井上に指示を出す看護師（この勤務帯の看護師）が決まっていません");
    expect(html).toContain("1人</b>以内です");
    expect(html).toContain("分担を確定 08:45 看護師 佐藤");
    expect(html).toContain("入院の受け入れ");
    expect(html).toContain("変える理由");
    expect(html).not.toContain("受け持ち患者割当");
  });

  it("the map shows each room's nurses of the shift now", () => {
    const all = [...PATIENTS, ...WARD_CHART_PATIENTS];
    const html = renderToStaticMarkup(<WardMap ward={{ beds: BEDS_WITH_CHARTS, patient: (id) => all.find((p) => p.id === id) }} summaries={{}} onOpen={() => {}} roomNote={(r) => roomNurses(plan, r.no, r.beds, nurses).map((n) => n.replace(/^(准看護師|看護師) /, "")).join("・") || undefined} />);
    expect(html).toMatch(/title="業務分担（いまの勤務帯の受け持ち）">田中</);
    expect(html).toMatch(/title="業務分担（いまの勤務帯の受け持ち）">井上</);
  });
});

describe("状態の一括登録", () => {
  const patients = [
    { id: "a", name: "甲 一郎", room: "512", infections: ["MRSA（血液）"] },
    { id: "b", name: "乙 花子", room: "515B", infections: [], rescue: "担送" as const },
  ];
  it("shows every patient with the four categories, the infection's precaution chosen, and the labels of the hospital's own rules", () => {
    const html = renderToStaticMarkup(<StatusBoard pick={pick} patients={patients} book={{}} nowTime="10:00" canType onRegister={() => {}} />);
    expect(html).toContain("2人を登録する");
    expect(html).toContain("まだ登録していません");
    expect(html).toMatch(/aria-pressed="true"[^>]*>接触</);
    expect(html).not.toContain("医政地発1219第1号");
    expect(html).not.toContain("架空の病院の取り決め");
    // 甲 has nothing chosen yet; 乙's 救護区分 comes from the bed.
    // 未入力 is a short mark with the number; the names are in its hover text.
    expect(html).toMatch(/title="未入力：重症度・観察の程度・生活の自由度・救護区分"[^>]*>未入力 (<!-- -->)?4</);
    // A row is picked by pressing it (or running down the check column); no separate buttons per row.
    expect(html).toContain("data-pick-cell");
    expect(html).toMatch(/<tr class="[^"]*cursor-pointer/);
    expect(html).toMatch(/<option value="担送" title="[^"]*" selected="">担送/);
  });

  it("says who registered the shift, and a viewer who may not register cannot change it", () => {
    const sheet = { rows: { a: { severity: "重症" as const, observe: "A" as const, freedom: "1" as const, rescue: "担送" as const, precautions: ["接触予防策" as const] } }, by: "看護師 佐藤", at: { day: 0, time: "09:10" } };
    const html = renderToStaticMarkup(<StatusBoard pick={pick} patients={patients} book={{ "0|day": [sheet] }} nowTime="10:00" canType={false} onRegister={() => {}} />);
    expect(html).toContain("登録済み 09:10 看護師 佐藤");
    expect(html).toContain("重症 1");
    expect(html).not.toContain("人を登録する");
    expect(html).not.toMatch(/<tr class="[^"]*cursor-pointer/);
  });
});

describe("褥瘡のある患者・褥瘡の経過", () => {
  it("the ward list shows the three fictional patients, overdue first, with the change and the sources", () => {
    const html = renderToStaticMarkup(<UlcerBoard pick={pick} ulcers={initialUlcers()} where={where} fmtDay={fmtDay} onOpen={() => {}} />);
    expect(html).toContain("3人・3か所");
    // 藤井（最後の評価が8日前）が先頭。
    expect(html.indexOf("藤井 さよ")).toBeLessThan(html.indexOf("野口 ハル"));
    expect(html).toContain("期限切れ");
    expect(html).toContain("D3-e3s6i1g3N3p0");
    expect(html).toContain("▼3点");
    expect(html).toContain("見本（図形）");
    expect(html).not.toContain("保医発0305第7号");
    expect(html).not.toContain("架空の病院の取り決め");
  });

  it("the chart's course shows each assessment, its total and photo, and the warning on real photos", () => {
    const html = renderToStaticMarkup(<PressurePanel patientId="90035151" ulcers={initialUlcers()} nowTime="10:00" fmtDay={fmtDay} newId={() => "x"} canRecord onChange={() => {}} />);
    expect(html).toContain("仙骨部");
    expect(html).toContain("持ち込み");
    expect(html).toContain("D3-e3s8i1G4N3p0");
    expect(html).toContain("<b>19</b>");
    expect(html).toContain("評価を記録");
    expect(html).not.toContain("日本褥瘡学会");
    // A viewer who may not record sees the course only.
    const ro = renderToStaticMarkup(<PressurePanel patientId="90035151" ulcers={initialUlcers()} nowTime="10:00" fmtDay={fmtDay} newId={() => "x"} canRecord={false} onChange={() => {}} />);
    expect(ro).not.toContain("＋ 褥瘡を登録");
    expect(ro).not.toContain("治癒とする");
  });
});
