// 保険・制度 of the 患者基本情報 window and the 外来の会計 render (on the server, without a browser) with what
// they are given: the registered insurance with 公費, the form with code's checks, the visit's points and
// the patient's share, the 領収書 columns and the 未収 list.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { calculateOpdClaim } from "@/lib/billing/opd-claim";
import { unpaidVisits } from "@/lib/billing/opd-settle";
import { EMPTY_FORM, INITIAL_INSURANCE_BOOK, toInsurance, type InsuranceRecord } from "@/lib/billing/registration";
import { EMPTY_DESK } from "@/lib/lab-desk";
import { visitPerson } from "@/lib/lab-visits";
import { OPD_PATIENTS } from "@/lib/opd";
import { STAFF, type Role } from "@/lib/roles";
import type { OrderEntry } from "@/lib/types";
import { OpdBillPanel, sections } from "./billing/OpdBillPanel";
import { InsuranceSection } from "./panels/InsuranceSection";
import { PatientInfoPanel } from "./panels/PatientInfoPanel";
import { PatientBar } from "./PatientBar";
import { MeProvider, RoleProvider } from "./RoleContext";

const today = { y: 2026, m: 11, d: 4 };
const fmtDay = (d: number) => `${d}日`;
const as = (role: Role, el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{el}</MeProvider>
    </RoleProvider>,
  );
const desk = EMPTY_DESK;
const nakatani = OPD_PATIENTS.find((p) => p.id === "opd-6")!;
const ishida = OPD_PATIENTS.find((p) => p.id === "opd-1")!;
const yoshimura = OPD_PATIENTS.find((p) => p.id === "opd-3")!;
const patientOf = (op: typeof nakatani, orders: OrderEntry[] = []) => visitPerson("opd", op, orders, desk).patient;

describe("患者基本情報の保険・制度", () => {
  it("shows the registered insurance of an outpatient: kind, rate, 資格確認, 有効期限", () => {
    const html = as("医師", <PatientInfoPanel patient={patientOf(ishida)} today={today} fmtDay={fmtDay} nowTime="10:00" insurance={INITIAL_INSURANCE_BOOK["opd:opd-1"]} onSave={() => {}} onRegisterInsurance={() => {}} />);
    expect(html).toContain("後期高齢者医療");
    expect(html).toContain("2割");
    expect(html).toContain("一般Ⅱ");
    expect(html).toContain("オンライン資格確認（模擬）");
    expect(html).toContain("2027-07-31");
    expect(html).toContain(">保険を編集</button>");
    expect(html).toContain("介護保険・かかりつけ");
  });
  it("an outpatient without height and weight: 「—（未測定）」 in the window and the bar, no 0 cm, no BMI NaN, no CCr", () => {
    // 中谷 (opd-6) has no measurement; 石田 (opd-1) has one.
    const html = as("医事課", <PatientInfoPanel patient={patientOf(nakatani)} today={today} fmtDay={fmtDay} nowTime="10:00" onSave={() => {}} />);
    expect(html).toContain("（未測定）");
    expect(html).not.toContain("0 cm");
    expect(html).not.toContain("0 kg");
    const bar = renderToStaticMarkup(<PatientBar patient={patientOf(nakatani)} today={today} diagnoses={[]} onOpenDiagnoses={() => {}} onOpenDirective={() => {}} />);
    expect(bar).toContain("（未測定）");
    expect(bar).not.toContain("0cm");
    expect(bar).not.toContain("NaN");
    expect(bar).toContain("測定なし");
    const measuredBar = renderToStaticMarkup(<PatientBar patient={patientOf(ishida)} today={today} diagnoses={[]} onOpenDiagnoses={() => {}} onOpenDirective={() => {}} />);
    expect(measuredBar).toContain("164cm");
    expect(measuredBar).toContain("BMI 23.6");
    expect(measuredBar).not.toContain("（未測定）");
  });
  it("shows 生活保護 with the 公費 (法別 12) and no 医保 numbers", () => {
    const html = as("看護師", <InsuranceSection patient={patientOf(yoshimura)} today={today} fmtDay={fmtDay} nowTime="10:00" records={INITIAL_INSURANCE_BOOK["opd:opd-3"]} onRegister={() => {}} />);
    expect(html).toContain("生活保護（医療扶助のみ）");
    expect(html).toContain("負担者番号 1214001");
    expect(html).toContain("受給者番号 0000321");
    expect(html).toContain("患者負担 0%");
    expect(html).not.toContain("保険者番号・記号番号");
  });
  it("the form warns when the 負担割合 does not fit the age and 区分, and names the law", () => {
    // 71歳・国保・一般 with 3割 typed: the law says 2割 (健康保険法74条).
    const wrong: InsuranceRecord = { ...INITIAL_INSURANCE_BOOK["opd:opd-6"][0], form: { ...INITIAL_INSURANCE_BOOK["opd:opd-6"][0].form, rate: "30" } };
    const html = as("医事課", <InsuranceSection patient={patientOf(nakatani)} today={today} fmtDay={fmtDay} nowTime="10:00" records={[wrong]} onRegister={() => {}} defaultEdit />);
    expect(html).toContain("負担割合は2割です（入力は3割）");
    expect(html).toContain("健康保険法74条1項");
    expect(html).toContain("「確かめる」の");
    expect(html).toContain("変更の理由（変えるときは必ず）");
    expect(html).toContain("公費を足す");
    expect(html).toContain("資格確認の方法");
    // 保険の種類 choices.
    for (const k of ["国民健康保険", "後期高齢者医療", "協会けんぽ（社保）", "生活保護（医療扶助のみ）", "自費", "労災", "公費のみ（医保なし）"]) expect(html).toContain(k);
  });
  it("the form stops a 公費 whose 負担者番号 fails the 検証番号 or the 法別番号", () => {
    const bad: InsuranceRecord = { form: { ...EMPTY_FORM, kind: "協会けんぽ", insurerNumber: "01140995", number: "1", relation: "本人", birthDate: "1972-02-14", rate: "30", incomeClass: "ウ", proof: "なし", verify: "資格確認書", verifiedOn: "2026-11-04", kohi: [{ lawNo: "54", name: "指定難病", payerNumber: "15140019", recipientNumber: "123", capYen: "" }] }, insurance: toInsurance(EMPTY_FORM), action: "登録", by: "x", at: { day: 0, time: "09:00" } };
    const html = as("医師", <InsuranceSection patient={patientOf({ ...nakatani, age: 54 })} today={today} fmtDay={fmtDay} nowTime="10:00" records={[bad]} onRegister={() => {}} defaultEdit />);
    expect(html).toContain("法別番号 54 と合いません");
    expect(html).toContain("受給者番号は7桁の数字です");
    expect(html).toContain("自己負担上限月額が書いてあります");
    expect(html).toContain("「直す」があるうちは登録できません");
  });
  it("薬剤師 only reads (架空の病院の取り決め)", () => {
    const html = as("薬剤師", <InsuranceSection patient={patientOf(ishida)} today={today} fmtDay={fmtDay} nowTime="10:00" records={INITIAL_INSURANCE_BOOK["opd:opd-1"]} onRegister={() => {}} />);
    expect(html).not.toContain(">保険を編集</button>");
    expect(html).toContain("医事課・医師・看護師が行います");
  });
});

describe("外来の会計", () => {
  const labs: OrderEntry[] = [{ kind: "order", id: "o1", day: 0, time: "09:10", author: "山本", status: "有効", order: { type: "lab", codes: ["SET-LYTES", "LAB-BUN", "LAB-CRE", "LAB-BNP"], collect: { day: 0, time: "09:15" }, priority: "至急" } }];
  const claim = calculateOpdClaim({ today: "2026-11-04", nowTime: "10:30", visit: { id: "opd-6", name: nakatani.name, age: nakatani.age, kind: "再診", department: nakatani.department }, entries: labs, rx: [{ items: [{ rp: 1, drug: "ORAL-X", perDose: 1, unit: "錠", timings: ["朝"], prn: null, maxPerDay: null, days: 28 }] }] });

  it("groups the points into the 領収証's columns", () => {
    const secs = sections(claim.acts);
    expect(secs.map((s) => s.name)).toEqual(["初・再診料", "投薬", "検査"]);
    expect(secs.find((s) => s.name === "初・再診料")?.points).toBe(128);
    expect(secs.find((s) => s.name === "投薬")?.points).toBe(60);
  });

  it("shows the visit's points, the 2割 share rounded to 10円, and lets 医事課 take the payment", () => {
    const html = as("医事課", <OpdBillPanel visit={nakatani} visitKey="opd:opd-6" entries={labs} rx={[]} records={INITIAL_INSURANCE_BOOK["opd:opd-6"]} today={today} nowTime="10:40" book={{}} unpaid={unpaidVisits(OPD_PATIENTS, {})} onSettle={() => {}} initial={claim} />);
    expect(html).toContain("外来の会計");
    expect(html).toContain("再診料");
    expect(html).toContain("外来管理加算");
    expect(html).toContain("血液採取");
    expect(html).toContain(`${claim.totalPoints.toLocaleString("ja-JP")}点`);
    const yen = Math.floor((claim.totalPoints * 10 * 0.2 + 5) / 10) * 10;
    expect(html).toContain(`お支払い`);
    expect(html).toContain(`入金（${yen.toLocaleString("ja-JP")}円）`);
    expect(html).toContain("国民健康保険");
    expect(html).toContain("2割");
    expect(html).toContain("自己負担限度額（外来）");
    expect(html).toContain("22,000円");
    expect(html).toContain("領収書");
    expect(html).toContain("診療明細書");
    expect(html).toContain("今日の外来の未収");
    expect(html).toContain("（この患者）");
    expect(html).toContain("この試作では算定しないもの");
    // 現金／カード: the whole label is a button 36px or taller (min-h-9), in a radio group.
    expect(html).toContain('aria-label="お支払いの方法"');
    expect(html.match(/<label class="flex min-h-9 cursor-pointer/g)?.length).toBe(2);
    expect(html.match(/name="opd-pay-method"/g)?.length).toBe(2);
  });

  it("a doctor sees the bill but cannot record the payment; a paid visit shows 会計済み", () => {
    const doc = as("医師", <OpdBillPanel visit={nakatani} visitKey="opd:opd-6" entries={labs} rx={[]} records={INITIAL_INSURANCE_BOOK["opd:opd-6"]} today={today} nowTime="10:40" book={{}} unpaid={[]} onSettle={() => {}} initial={claim} />);
    expect(doc).toContain("会計の記録は医事課が行います");
    const paid = { visitId: "opd:opd-6", receiptNo: "R-20261104-001", points: claim.totalPoints, yen: 580, coverage: "医保" as const, rateLabel: "2割", method: "現金" as const, by: "医事課 渡辺", at: { day: 0, time: "10:41" } };
    const done = as("医事課", <OpdBillPanel visit={nakatani} visitKey="opd:opd-6" entries={labs} rx={[]} records={INITIAL_INSURANCE_BOOK["opd:opd-6"]} today={today} nowTime="10:45" settlement={paid} book={{ "opd:opd-6": paid }} unpaid={[]} onSettle={() => {}} initial={claim} />);
    expect(done).toContain("会計済み");
    expect(done).toContain("R-20261104-001");
    expect(done).not.toContain("入金（");
    expect(done).toContain("未収はありません");
  });

  it("without a registered insurance it says the share is from an assumed one", () => {
    const html = as("医事課", <OpdBillPanel visit={{ ...nakatani, id: "opd-99" }} visitKey="opd:opd-99" entries={[]} rx={[]} today={today} nowTime="10:40" book={{}} unpaid={[]} onSettle={() => {}} initial={claim} />);
    expect(html).toContain("年齢からの仮の保険");
    expect(html).toContain("先に患者基本情報で保険を登録してください");
  });
});
