// Mouse on the ward screens (束C): what renders without a browser. Dragging and the menus are checked in a browser.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { BEDS_WITH_CHARTS, WARD_CHART_PATIENTS } from "@/lib/ward-charts";
import type { AdmissionRequest } from "@/lib/admission";
import { STAFF } from "@/lib/roles";
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
