// The simulated national services render (on the server, without a browser) with what they are given.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { INITIAL_INSURANCE_BOOK } from "@/lib/billing/registration";
import { PATIENTS } from "@/lib/patients";
import { STAFF, type Role } from "@/lib/roles";
import { InsurancePanel } from "../billing/InsurancePanel";
import { MeProvider, RoleProvider } from "../RoleContext";
import { OnshiCheck } from "./OnshiCheck";
import { INITIAL_DIAGNOSES } from "@/lib/diagnoses";
import type { OrderEntry } from "@/lib/types";
import { ClinsPanel } from "./ClinsPanel";
import { ErxPanel } from "./ErxPanel";
import { NationalPanel } from "./NationalPanel";

const today = { y: 2026, m: 11, d: 4 };
const as = (role: Role, node: React.ReactNode) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{node}</MeProvider>
    </RoleProvider>,
  );

describe("オンライン資格確認（模擬）", () => {
  const p = PATIENTS[0];
  it("is in 保険の登録, marked 模擬, with the public sources and what it cannot fill", () => {
    const html = as("医事課", <InsurancePanel patient={p} records={INITIAL_INSURANCE_BOOK[p.id]} today={today} nowTime="10:00" onRegister={() => {}} />);
    expect(html).toContain("資格を確認（模擬）");
    expect(html).toContain("オンライン資格確認等システムにはつないでいません");
    expect(html).toContain("https://www.mhlw.go.jp/content/10200000/000726675.pdf");
    expect(html).toContain("この試作では埋められない項目");
  });
  it("chooses nothing in advance and cannot ask before the window chooses how the patient came", () => {
    const html = as("医事課", <OnshiCheck person={{ id: p.id, name: p.name, kana: p.kana, sex: p.sex, age: p.age }} today={today} nowTime="10:00" />);
    expect(html).not.toContain("checked");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>資格を確認（模擬）/);
  });
  it("on the 外来 reception form (compact) waits for the name, and has no spec box", () => {
    const html = as("医事課", <OnshiCheck compact person={null} today={today} nowTime="10:00" />);
    expect(html).toContain("氏名・カナ・性別・年齢を入れると確認できます");
    expect(html).not.toContain("従った仕様");
  });
});

describe("電子処方箋（模擬）と電子カルテ情報共有サービス（模擬）in the chart", () => {
  const kitamura = PATIENTS.find((p) => p.id === "90010198")!;
  const entries = kitamura.history.filter((e): e is OrderEntry => e.kind === "order");
  const ins = INITIAL_INSURANCE_BOOK["90010198"][0].insurance;

  it("shows the 退院時処方, asks 院内 or 院外 first, and names HS036", () => {
    const html = as("医師", <NationalPanel patient={kitamura} entries={entries} diagnoses={INITIAL_DIAGNOSES[kitamura.id]} book={INITIAL_INSURANCE_BOOK} today={today} nowTime="10:30" log={[]} onRecord={() => {}} />);
    expect(html).toContain("電子処方箋");
    expect(html).toContain("模擬");
    expect(html).toContain("Rp2 酸化マグネシウム錠330mg 1回1錠 1日2回 朝夕食後 14日分");
    expect(html).toContain("院内処方（薬剤部が調剤し、患者が持ち帰る）");
    expect(html).not.toContain("checked");
    expect(html).toContain("HS036");
  });

  it("for an outpatient prescription builds the HS036 JSON at once, and locks the steps for a nurse", () => {
    const lines = [{ rp: 1, drug: "ORAL-SPL25", perDose: 1, unit: "錠", timings: ["朝" as const], prn: null, maxPerDay: null, days: 28 }];
    const props = { patient: { id: "opd-1", name: "石田 正男", kana: "イシダ マサオ", sex: "男" as const, birthDate: "1948-02-01" }, patientKey: "opd-1", department: "総合診療科", insurance: ins, insuranceAssumed: true, lines, today, nowTime: "10:30", mode: "外来" as const, serial: 1, done: [], onRegistered: () => {} };
    const html = as("医師", <ErxPanel {...props} />);
    expect(html).toContain("処方情報の FHIR（HS036・処方箋番号 1419900010-2026-00000001）");
    expect(html).toContain("重複投薬等チェック（模擬）");
    expect(html).toContain("署名する（模擬）");
    expect(html).toContain("HPKI");
    expect(html).toContain("年齢からの仮の保険");
    expect(as("看護師", <ErxPanel {...props} />)).toContain("医師が行います");
  });

  it("lists what would be sent to the 電子カルテ情報共有サービス, and needs the consent first", () => {
    const html = as("医師", <ClinsPanel patient={kitamura} birthDate="1947-05-03" insurance={ins} insuranceAssumed={false} diagnoses={INITIAL_DIAGNOSES[kitamura.id]} entries={entries} today={today} nowTime="10:30" done={[]} onSent={() => {}} />);
    expect(html).toContain("臨床情報：傷病名（2件）");
    expect(html).toContain("退院時サマリーがまだありません");
    expect(html).toContain("NSAIDs（喘息発作）");
    expect(html).toContain("JP-CLINS");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>送る（模擬）/);
    expect(html).toContain("健康診断結果報告書");
  });
});
