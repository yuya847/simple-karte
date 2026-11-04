// The simulated national services render (on the server, without a browser) with what they are given.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { INITIAL_INSURANCE_BOOK } from "@/lib/billing/registration";
import { PATIENTS } from "@/lib/patients";
import { STAFF, type Role } from "@/lib/roles";
import { InsurancePanel } from "../billing/InsurancePanel";
import { MeProvider, RoleProvider } from "../RoleContext";
import { OnshiCheck } from "./OnshiCheck";

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
