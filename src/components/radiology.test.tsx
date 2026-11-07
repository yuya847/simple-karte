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
    expect(html).toContain("指示受け");
    expect(html).toContain("当日の予定");
    expect(html).toContain("ポータブル回り");
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
    expect(html).toContain("同意書がありません。");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>撮影済みにする/);
  });
  it("shows the simulated modality with its devices, labelled 模擬", () => {
    const html = as("診療放射線技師", <ModalitySim rows={risRows(people, desk)} onDesk={() => {}} nowTime="10:00" today={today} />);
    expect(html).toContain("模擬：本物の装置にはつないでいません");
    expect(html).toContain("SK_CT1");
    expect(html).toContain("ワークリストを問い合わせる");
    expect(html).not.toContain("Radiation Dose Module");
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

it("照射録の不足理由を未撮影でもボタンのそばに表示する", () => {
  const row = risRows(people, {}).find((r) => r.orderId === "o-ris-demo3")!;
  const html = as("診療放射線技師", <ExamForm r={row} onDesk={() => {}} nowTime="10:00" today={today} />);
  expect(html).toContain("指示受け（受付）がまだです。");
  expect(html).not.toContain("枚数が入っていません");
  expect(html).toContain("管電圧（kV）");
  expect(html).toContain("管電流時間積（mAs）");
});

it("ポータブルは ID・年齢・本人確認があり、未確認では撮影開始を押せない", async () => {
  const { PortableRound } = await import("./RadiologyTake");
  const row = risRows(people, desk).find((r) => r.orderId === "o-ris-demo1")!;
  const work = { ...row.work!, done: undefined, images: undefined, report: undefined, started: undefined };
  const portable = { ...row, status: "受付済み" as const, work: { ...work, inRoom: { day: 0, time: "09:50", by: "技師" } } };
  const html = as("診療放射線技師", <PortableRound rows={[portable]} onDesk={() => {}} nowTime="10:00" />);
  expect(html).toContain(row.patientId);
  expect(html).toContain(`${row.age}歳`);
  expect(html).toContain("本人を確認した");
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>撮影開始/);
});

it("撮影済みの照射録には画像を送るボタンと保存した条件がある", () => {
  const row = risRows(people, desk).find((r) => r.orderId === "o-ris-demo1")!;
  const html = as("診療放射線技師", <ExamForm r={{ ...row, work: { ...row.work!, images: undefined } }} onDesk={() => {}} nowTime="10:00" today={today} />);
  expect(html).toContain("画像を送る");
  expect(html).toContain('value="90"');
  expect(html).toContain('value="2.5"');
  expect(html).not.toContain("枚数が入っていません");
});

it("撮影前の本人確認と装置割り当てがあり、未実施への取り消しは撮影後だけ", () => {
  const row = risRows(people, desk).find((r) => r.orderId === "o-ris-demo3")!;
  const html = as("診療放射線技師", <ExamForm r={row} onDesk={() => {}} nowTime="10:00" today={today} />);
  expect(html).toContain("氏名・生年月日・リストバンドを確認した");
  expect(html).toContain('aria-label="撮影室・装置"');
  expect(html).not.toContain("未実施に戻す");
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>撮影済みにする/);
});

it("技師の読影は状態一覧だけ、所見・診断の入力欄を表示しない", async () => {
  const { ReadingStatus } = await import("./RadiologyView");
  const html = as("診療放射線技師", <ReadingStatus rows={risRows(people, desk)} />);
  expect(html).toContain("確定");
  expect(html).toContain("読影待ち");
  expect(html).not.toContain("textarea");
  expect(html).not.toContain("訂正");
});

it("造影の受付には値と3項目のチェック、同意書なしの受け止めがある", async () => {
  const { TakeOne } = await import("./RadiologyTake");
  const { risConfirmItems } = await import("@/lib/ris-take");
  const row = risRows(people, desk).find((r) => r.orderId === "o-ris-demo2")!;
  const person = people.find((p) => p.patient.id === row.patientId)!;
  const html = as("診療放射線技師", <TakeOne r={row} reasons={["造影"]} items={risConfirmItems(row, person.patient, person.entries, undefined, today)} consentOk={false} onTake={() => {}} onClose={() => {}} />);
  for (const text of ["Cre", "eGFR", "ヨードのアレルギー", "同意", "腎機能を確かめた", "アレルギーを確かめた", "同意書あり", "同意書がないため受けられません"]) expect(html).toContain(text);
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>指示を受ける/);
  expect(html).not.toContain("自分の目で");
});

it("造影剤を記録し本人・受付・装置・指示確認が済んでも、同意撤回なら撮影完了を止める", () => {
  const ct = risRows(people, desk).find(r => r.orderId === "o-ris-demo2")!;
  const at = { day: 0, time: "10:00", by: "技師" };
  const r = { ...ct, order: { ...ct.order, consent: { state: "取得済み" as const, at: null, by: null, form: null, reason: null } }, work: { ...ct.work!, orderId: ct.orderId, patientId: ct.patientId, label: ct.label, room: "CT1" as const, arrived: at, identityChecked: at, confirmed: { ...at, items: ["確認済み"] }, contrast: { ...at, code: "test", name: "試験", count: 1, route: "静注" as const, lot: "test", reaction: "なし" as const } } };
  const html = as("診療放射線技師", <ExamForm r={r} onDesk={() => {}} nowTime="10:00" today={today} consents={[{ orderId: ct.orderId, status: "撤回" } as import("@/lib/consent").ConsentRecord]} />);
  expect(html).toContain("同意書がありません。");
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>撮影済みにする/);
});
