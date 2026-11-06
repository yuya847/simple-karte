// The department screens render (on the server, without a browser) with what they are given.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EMPTY_LIAISON } from "@/lib/liaison";
import { OPD_PATIENTS } from "@/lib/opd";
import { CARDS, displayBoard, OTHER_DEPT_TODAY } from "@/lib/opd-desk";
import { EMPTY_FORM, INITIAL_INSURANCE_BOOK } from "@/lib/billing/registration";
import { PATIENTS } from "@/lib/patients";
import { BEDS, FLOORS, OTHER_FLOOR_BEDS } from "@/lib/ward";
import { LiaisonView } from "./LiaisonView";
import { EMPTY_OPD_DESK, OpdDesk, Reception } from "./OpdDesk";
import { KioskScreen, WaitingDisplay } from "./OpdScreens";
import { ReceptionInsurance } from "./ReceptionInsurance";
import { MeProvider, RoleProvider } from "./RoleContext";
import { StatsView } from "./StatsView";
import { ReceiptDesk } from "./ReceiptDesk";
import { EMPTY_RETURNS } from "@/lib/billing/returns";
import { STAFF, type Role } from "@/lib/roles";

const today = { y: 2026, m: 11, d: 4 };
const opd = [...OPD_PATIENTS, ...OTHER_DEPT_TODAY];
const as = (role: Role, node: React.ReactNode) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{node}</MeProvider>
    </RoleProvider>,
  );

describe("地域医療連携", () => {
  it("shows the ledger with today's 紹介 from the outpatient list, and locks recording for a doctor", () => {
    const html = as("医師", <LiaisonView today={today} nowTime="10:00" book={EMPTY_LIAISON} onBook={() => {}} opd={opd} er={[]} letters={[]} />);
    expect(html).toContain("紹介・逆紹介の台帳");
    expect(html).toContain("坂本 ヨシ");
    expect(html).toContain("〇〇内科クリニック");
    expect(html).toContain("MSW・医事課が行います");
  });
  it("lets the 連携室 record", () => {
    const html = as("MSW", <LiaisonView today={today} nowTime="10:00" book={EMPTY_LIAISON} onBook={() => {}} opd={opd} er={[]} letters={[{ patientId: "p", name: "架空 次郎", kana: "カクウ ジロウ", department: "総合診療科", doctor: "山本", to: "さくら坂病院", purpose: "療養", issuedDay: 0 }]} />);
    expect(html).not.toContain("MSW・医事課が行います");
    expect(html).toContain("架空 次郎");
    expect(html).toContain("退院サマリの紹介状");
  });
});

describe("統計・日報", () => {
  it("shows today's 日報 counted from the beds", () => {
    const patient = (id: string) => PATIENTS.find((p) => p.id === id);
    const html = as("医事課", <StatsView today={today} nowTime="10:00" floors={FLOORS} beds={[...BEDS, ...OTHER_FLOOR_BEDS]} moves={{}} patient={patient} opd={opd} er={[]} />);
    expect(html).toContain("日報");
    expect(html).toContain("5階東病棟");
    expect(html).toContain("全病棟");
    expect(html).toContain("CSV で保存");
  });
});

describe("レセプト点検・返戻", () => {
  it("shows the 点検 tab first, and says オンライン請求 is not connected", () => {
    const html = as("医事課", <ReceiptDesk patients={PATIENTS} diagnoses={{}} today={today} nowTime="10:00" payload={() => []} onOpen={() => {}} desk={EMPTY_RETURNS} onDesk={() => {}} />);
    expect(html).toContain("点検の一覧");
    expect(html).toContain("オンライン請求にはつないでいません（模擬）");
    expect(html).toContain("新しい決まりは足していません");
  });
});

describe("外来の受付", () => {
  it("lists today's patients with 受付番号 and 呼出, across departments", () => {
    const html = as("看護師", <OpdDesk patients={opd} onPatients={() => {}} desk={EMPTY_OPD_DESK} onDesk={() => {}} revisits={[]} today={today} nowTime="09:30" requests={{}} onOpen={() => {}} onOpenChart={() => {}} newId={() => "x"} />);
    expect(html).toContain("受付番号");
    expect(html).toContain("呼出");
    expect(html).toContain("循環器内科 森");
    expect(html).toContain("再来受付機（模擬）を開く");
    // The whole 氏名 cell (カナ・氏名・年齢性別) is one button that opens the patient's tab; the 受付票 print is separate.
    expect(html).toContain('aria-label="石田 正男 のタブを開く"');
    expect(html).toMatch(/<button[^>]*aria-label="石田 正男 のタブを開く"[^>]*class="block min-h-8 w-full[^"]*"><span[^>]*>イシダ マサオ<\/span>/);
    expect(html).toContain('aria-label="石田 正男 の受付票を印刷"');
  });
  it("the 受付 form: 「受け付ける」 with what is still missing beside it, the insurance block, and no print until received", () => {
    const html = as("医事課", <Reception cards={CARDS} patients={opd} insuranceBook={INITIAL_INSURANCE_BOOK} today={today} nowTime="09:30" locked={null} onReceive={() => {}} />);
    expect(html).toContain(">受け付ける</button>");
    expect(html).not.toContain("受け付けて受付票を印刷");
    expect(html).toContain("まだ入れるもの：区分（初診・再診）");
    // 初診／再診: big buttons (36px or taller, the whole label) as the 会計's 現金／カード.
    expect(html).toContain('aria-label="区分（初診・再診）"');
    expect(html.match(/<label class="flex min-h-9 cursor-pointer/g)?.length).toBe(2);
    expect(html.match(/name="kind"/g)?.length).toBe(2);
    expect(html).not.toContain("受付票を印刷</button>");
    expect(html).not.toContain("受け付けました");
    // Before a 区分 is chosen the insurance block is not shown; the component itself renders the window's fields.
    const ins = as("医事課", <ReceptionInsurance form={EMPTY_FORM} onChange={() => {}} today={today} checks={[]} />);
    expect(ins).toContain("保険の種類");
    expect(ins).toContain("資格確認の方法");
    expect(ins).not.toContain("負担割合");
    expect(ins).not.toContain("生活保護（医療扶助のみ）</option>");
    expect(ins).not.toContain("を入れてください");
    // A 医保 kind chosen: the card's numbers, 本人・家族, 負担割合 and the 区分 appear.
    const kokuho = as("医事課", <ReceptionInsurance form={{ ...EMPTY_FORM, kind: "国保", coverage: "医保" }} onChange={() => {}} today={today} checks={[]} />);
    expect(kokuho).toContain("保険者番号");
    expect(kokuho).toContain("本人・家族");
    expect(kokuho).toContain("負担割合");
    expect(kokuho).toContain("所得区分");
    // 再診 with an earlier registration: shown, not edited.
    const found = as("医事課", <ReceptionInsurance form={EMPTY_FORM} onChange={() => {}} today={today} checks={[]} existing={INITIAL_INSURANCE_BOOK["opd:opd-1"][0]} />);
    expect(found).toContain("保険（登録あり）");
    expect(found).toContain("「確認」として引き継ぎます");
  });
  it("after receiving, the form shows the 受付番号 and the 受付票を印刷 button (no dialog by itself)", () => {
    const html = as("医事課", <Reception cards={CARDS} today={today} nowTime="09:30" locked={null} done={{ name: "架空 太郎", ticket: 12, onPrint: () => {}, onList: () => {} }} onReceive={() => {}} />);
    expect(html).toContain("受け付けました：<b>架空 太郎</b>さん");
    expect(html).toContain("012");
    expect(html).toContain("受付票を印刷");
    expect(html).toContain("受付一覧へ");
  });
  it("shows numbers only on the waiting-room display", () => {
    const html = renderToStaticMarkup(<WaitingDisplay board={displayBoard(opd, 3)} nowTime="09:30" onClose={() => {}} />);
    expect(html).toContain("診察室1");
    expect(html).toContain("お会計");
    expect(html).not.toContain("石田");
  });
  it("shows the kiosk's number pad and says it is 模擬", () => {
    const html = renderToStaticMarkup(<KioskScreen samples={[{ cardNo: "1000105", label: "総合診療科 10:00" }]} onRead={() => ({ kind: "番号が違います" })} onSlip={() => {}} onClose={() => {}} />);
    expect(html).toContain("診察券の番号（7桁）");
    expect(html).toContain("模擬");
  });
});
