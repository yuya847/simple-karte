// Mouse on the ward screens (束C): what renders without a browser. Dragging and the menus are checked in a browser.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { BEDS_WITH_CHARTS, WARD_CHART_PATIENTS } from "@/lib/ward-charts";
import type { AdmissionRequest } from "@/lib/admission";
import { flagsFor, withRxAction } from "@/lib/patient-flags";
import { STAFF } from "@/lib/roles";
import { PatientList } from "./PatientList";
import { MeProvider, RoleProvider } from "./RoleContext";
import { WardMap } from "./WardMap";
import { WardRequests } from "./WardRequests";

const all = [...PATIENTS, ...WARD_CHART_PATIENTS];
const ward = { beds: BEDS_WITH_CHARTS, patient: (id: string) => all.find((p) => p.id === id) };
const team = new Set(PATIENTS.map((p) => p.id));
const asDoctor = (el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value="医師">
      <MeProvider value={STAFF.医師}>{el}</MeProvider>
    </RoleProvider>,
  );

const request: AdmissionRequest = {
  id: "req-1",
  from: { kind: "er", id: "er-1" },
  name: "架空 花子",
  kana: "カクウ ハナコ",
  sex: "女",
  age: 82,
  diagnosis: "尿路感染症の疑い",
  department: "総合診療科",
  attending: "山本（専攻医）",
  urgency: "緊急",
  when: { day: 0, time: null },
  ward: "5階東病棟",
  roomWish: "どちらでも",
  isolation: "なし",
  rest: "車いす",
  purpose: "治療",
  heightCm: 150,
  weightKg: 45,
  allergies: [],
  note: "",
  by: "山本（専攻医）",
  status: "申込",
  at: { day: 0, time: "09:00" },
};

describe("病棟マップ：入院申込を空床へドラッグ、カードの「移動」は右クリックへ", () => {
  it("the team's cards carry no 「移動」 button; they are dragged to an empty bed instead", () => {
    const html = renderToStaticMarkup(<WardMap ward={ward} summaries={{}} mine={(id) => team.has(id)} onOpen={() => {}} onMove={() => {}} onDropRequest={() => {}} />);
    expect(html).not.toContain(">移動<");
    expect(html.match(/draggable="true"/g)?.length).toBe(PATIENTS.filter((p) => BEDS_WITH_CHARTS.some((b) => b.patientId === p.id)).length);
    // No drag going on: the empty beds look as before (no reason shown, nothing faded).
    expect(html).not.toContain("性の部屋です");
    expect(html).not.toContain("data-takes");
  });
  it("a 入院申込 can be picked up by its line when the ward makes its chart", () => {
    const html = asDoctor(<WardRequests floor="5階東病棟" requests={[request]} ward={ward} rooms={[]} fmtDay={() => "今日"} onAccept={() => {}} />);
    expect(html).toMatch(/<div draggable="true"[^>]*cursor-grab/);
    // The button and the list of beds stay (a finger, a keyboard).
    expect(html).toContain("ベッドを決める");
  });
  it("another floor (no chart there in this prototype) cannot be dragged", () => {
    const html = asDoctor(<WardRequests floor="4階西病棟" requests={[{ ...request, ward: "4階西病棟" }]} ward={ward} rooms={[]} fmtDay={() => "今日"} onAccept={() => {}} />);
    expect(html).toMatch(/<div draggable="false"/);
  });
});

describe("入院患者一覧：印を押すと、その患者のその道具が開く", () => {
  const mine = (id: string) => team.has(id);
  const p = PATIENTS[0];
  const list = (onOpenAt?: (id: string, where: string) => void) =>
    renderToStaticMarkup(<PatientList ward={ward} title="患者一覧" nowTime="10:00" changes={{}} summaries={{}} waiting={{ [p.id]: 1 }} resultState={{ [p.id]: { unseen: 2, panic: 0 } }} mine={mine} onOpen={() => {}} onOpenAt={onOpenAt} />);
  it("each mark that has a place is a button when the list can open the chart at a tool", () => {
    const html = list(() => {});
    expect(html).toMatch(/<button type="button" title="今日の検査・画像・培養の結果を、医師がまだ確認していません"[^>]*>未確認の結果 2<\/button>/);
    expect(html).toMatch(/<button type="button" title="今日の新しい指示・中止を、看護師がまだ受けていません"[^>]*>指示受けがまだ 1<\/button>/);
  });
  it("without it the marks stay as they were", () => {
    expect(list()).not.toMatch(/<button[^>]*>未確認の結果 2<\/button>/);
  });
  it("the marks know their place: 結果 → 検査結果, 指示受け, 実施入力, DNAR → 事前指示, アレルギー → プロファイル, 処方切れ → 内服カレンダー", () => {
    const flags = flagsFor({ ...p, codeStatus: "DNAR", allergies: ["乳"] }, [], 600, 1, undefined, 3, { unseen: 1, panic: 1 }, ["安静度"]);
    const at = (start: string) => flags.find((f) => f.label.startsWith(start))?.action;
    expect(at("入院時指示がまだ")).toBe("standing");
    expect(at("パニック値")).toBe("results");
    expect(at("未確認の結果")).toBe("results");
    expect(at("指示受けがまだ")).toBe("take");
    expect(at("実施の入力がまだ")).toBe("execute");
    expect(at("DNAR")).toBe("directive");
    expect(at("アレルギー")).toBe("profile");
    expect(withRxAction([{ label: "処方切れ 明日", tone: "yamabuki" }])[0].action).toBe("rxcal");
  });
  it("診療科・担当 is one line, cut at the column; the whole is on the cursor", () => {
    const html = list(() => {});
    expect(html).toMatch(new RegExp(`<div title="${p.department}\\n${p.attending.replace(/[()（）]/g, ".")}[^"]*" class="max-w-60 truncate whitespace-nowrap">`));
  });
});
