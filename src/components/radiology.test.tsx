// 放射線部 and the simulated modality render (on the server, without a browser) with what they are given.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { demoRisOrders, initialRisDesk, putWork, risRows } from "@/lib/ris";
import { STAFF, type Role } from "@/lib/roles";
import type { OrderEntry } from "@/lib/types";
import { ModalitySim } from "./ModalitySim";
import { RisChartStrip } from "./panels/RisChartStrip";
import { RadiologyView } from "./RadiologyView";
import { MeProvider, RoleProvider } from "./RoleContext";
import { ExamForm } from "./RisExam";

const today = { y: 2026, m: 11, d: 4 };
const orders = demoRisOrders(600);
const people = PATIENTS.map((p) => ({ patient: p, room: p.room, entries: (orders[p.id] ?? []) as OrderEntry[] }));
const desk = initialRisDesk(600);
const as = (role: Role, node: React.ReactNode, name = STAFF[role].name) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={{ role, name }}>{node}</MeProvider>
    </RoleProvider>,
  );

describe("放射線部", () => {
  it("lists the requests to take in, and locks the work for a nurse", () => {
    const html = as("看護師", <RadiologyView people={people} desk={desk} onDesk={() => {}} acks={{}} nowTime="10:00" today={today} />);
    expect(html).toContain("受付・割り当て");
    expect(html).toContain("大浦 トメ");
    expect(html).toContain("撮影の受付・実施・照射録・線量と造影剤の記録は診療放射線技師が行います");
  });
  it("lets the technologist record a CT: conditions, dose with its DRL, the contrast medium, and the 照射録 items", () => {
    const ct = risRows(people, putWork(desk, { orderId: "o-ris-demo2", patientId: "90010260", label: "CT" }, (w) => ({ ...w, arrived: { day: 0, time: "14:40", by: "x" }, room: "CT1" }))).find((r) => r.orderId === "o-ris-demo2")!;
    const html = as("診療放射線技師", <ExamForm r={ct} onDesk={() => {}} nowTime="15:00" today={today} />);
    expect(html).toContain("管電流");
    expect(html).toContain("CTDIvol");
    expect(html).toContain("2相の撮影なので、1相の DRL とは比べません。");
    expect(html).toContain("イオパミロン注３００シリンジ");
    expect(html).toContain("四　指示を受けた医師の氏名及びその指示の内容");
    expect(html).toContain("使った造影剤を記録してください");
  });
  it("shows the simulated modality with its devices, labelled 模擬", () => {
    const html = as("診療放射線技師", <ModalitySim rows={risRows(people, desk)} onDesk={() => {}} nowTime="10:00" today={today} />);
    expect(html).toContain("模擬：本物の装置にはつないでいません");
    expect(html).toContain("SK_CT1");
    expect(html).toContain("ワークリストを問い合わせる");
    expect(html).toContain("Radiation Dose Module");
  });
  it("in the chart: the 照射録 waits for the ordering doctor's signature and the report for 確認", () => {
    const kitamura = PATIENTS.find((p) => p.id === "90010198")!;
    const html = as("医師", <RisChartStrip patient={kitamura} entries={orders[kitamura.id]} desk={desk} onDesk={() => {}} acks={{}} nowTime="10:00" onSeen={() => {}} />);
    expect(html).toContain("照射録に署名");
    expect(html).toContain("両側胸水と肺うっ血は前回と著変なし。");
    expect(html).toContain("確認した");
    const other = as("医師", <RisChartStrip patient={kitamura} entries={orders[kitamura.id]} desk={desk} onDesk={() => {}} acks={{}} nowTime="10:00" onSeen={() => {}} />, "研修医 田中");
    expect(other).toContain("指示をした医師（山本（専攻医））が署名します。");
  });
});
