// 患者基本情報 renders (on the server, without a browser) with what it is given: the sections, the first
// person to call, the family with 続柄, the insurance 医事課 registered, the admission interview or 「まだ」,
// and who may change the contacts.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptyAnamnesis, saveAnamnesis } from "@/lib/anamnesis";
import { INITIAL_INSURANCE_BOOK } from "@/lib/billing/registration";
import { INITIAL_CONTACTS } from "@/lib/patient-contacts";
import { PATIENTS } from "@/lib/patients";
import { STAFF, type Role } from "@/lib/roles";
import { PatientBar } from "./PatientBar";
import { PatientInfoPanel } from "./panels/PatientInfoPanel";
import { MeProvider, RoleProvider } from "./RoleContext";

const oura = PATIENTS.find((p) => p.id === "90010244")!;
const sakura = PATIENTS.find((p) => p.id === "90010231")!;
const today = { y: 2026, m: 11, d: 4 };
const fmtDay = (d: number) => `${d}日`;
const as = (role: Role, el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{el}</MeProvider>
    </RoleProvider>,
  );
const anamnesis = saveAnamnesis(undefined, oura.id, { ...emptyAnamnesis(), living: "独居", family: "長女が市内に住む", keyPerson: "長女 田辺 幸子", care: { 移動: "歩行器" }, careInsurance: "要介護2", hope: "家に帰りたい" }, "看護師 佐藤", { day: -1, time: "20:00" }, "");

describe("患者基本情報の窓", () => {
  it("shows every section, with the first person to call, the family's 続柄 and who registered it", () => {
    const html = as("医師", <PatientInfoPanel patient={oura} today={today} fmtDay={fmtDay} nowTime="10:00" contacts={INITIAL_CONTACTS[oura.id]} insurance={INITIAL_INSURANCE_BOOK[oura.id]} anamnesis={anamnesis} onOpen={() => {}} onSave={() => {}} />);
    for (const h of ["基本", "連絡先・家族", "保険・制度", "入院前の情報収集（アナムネーシス）", "アレルギー・感染症・注意・事前指示", "登録の履歴"]) expect(html).toContain(h);
    // 基本: the birth date 医事課 registered with the insurance, with the era.
    expect(html).toContain("1940年2月20日（昭和15年）");
    expect(html).toContain("86歳女性");
    expect(html).toContain("A型 Rh(+)");
    expect(html).toContain("誤嚥性肺炎");
    // 連絡先: 第一連絡先 with 続柄, the dummy number and when to call; the second one after it.
    expect(html).toMatch(/第一連絡先[\s\S]*<b>長女<\/b> 田辺 幸子[\s\S]*090-0000-0245[\s\S]*連絡できる時間帯：日中は携帯に/);
    expect(html).toMatch(/第2連絡先[\s\S]*<b>長男<\/b> 大浦 一郎/);
    expect(html).toContain("〒000-0000　架空県架空市松が丘2-15-8");
    // 家族: 続柄・年齢・同居・キーパーソン.
    expect(html).toMatch(/<td class="pr-2 font-bold">長女<\/td><td class="pr-2">田辺 幸子<\/td><td class="nums pr-2">60歳<\/td><td class="pr-2">別居<\/td><td class="pr-2"><b class="text-ai">キーパーソン<\/b>/);
    expect(html).toContain("週2回様子を見に来ている");
    // Who registered it, and when.
    expect(html).toContain("登録：-1日 15:20 医事課 渡辺");
    // 保険: what 医事課 registered, 公費 and 介護.
    expect(html).toContain("後期高齢者");
    expect(html).toContain("1割");
    expect(html).toContain("低所得Ⅱ");
    expect(html).toContain("要介護2");
    expect(html).toContain("架空市ケアプランセンター松が丘");
    expect(html).toContain("架空市立松が丘診療所");
    // 入院前の情報収集: the headings and answers of the interview.
    expect(html).toContain("第1版　-1日 20:00 看護師 佐藤");
    expect(html).toContain("家族・社会的背景");
    expect(html).toMatch(/住まい<\/dt>[\s\S]*独居/);
    expect(html).toMatch(/キーパーソン（続柄・名前）<\/dt>[\s\S]*長女 田辺 幸子/);
    expect(html).toMatch(/介助<\/dt>[\s\S]*移動 歩行器/);
    expect(html).toContain("家に帰りたい");
    // The notes that do not hide.
    expect(html).toContain("実在の患者の情報は入れないでください。");
    expect(html).not.toContain("架空の病院の取り決め");
    expect(html).not.toContain(">架空の患者</span>");
    expect(html).toContain("nanbuweb.hosp.pref.okinawa.jp");
  });

  it("without an interview or contacts or insurance it says so and offers the drawers", () => {
    const html = as("看護師", <PatientInfoPanel patient={sakura} today={today} fmtDay={fmtDay} nowTime="10:00" onOpen={() => {}} onSave={() => {}} />);
    expect(html).toContain("まだ聞き取っていません");
    expect(html).toContain("情報収集を始める");
    expect(html).toContain("住所・連絡先・家族はまだ登録されていません。「登録する」で入れます。");
    expect(html).toContain("未登録です。「保険を登録する」で入れます");
    // The birth date is made from the age (a fictional one) and gives 72.
    expect(html).toContain("年齢から作った日付");
    expect(html).toMatch(/19(53|54)年\d+月\d+日（昭和(28|29)年）/);
    // Allergies and 事前指示 with the links to their drawers.
    expect(html).toContain("ヨード造影剤（蕁麻疹）");
    expect(html).toContain("MRSA（血液）");
    expect(html).toContain("プロファイルを開く");
    expect(html).toContain("事前指示を開く");
    expect(html).toContain("未確認");
  });

  it("医事課・看護師・医師 may change the contacts; the others only read (架空の病院の取り決め)", () => {
    const clerk = as("医事課", <PatientInfoPanel patient={oura} today={today} fmtDay={fmtDay} nowTime="10:00" contacts={INITIAL_CONTACTS[oura.id]} onSave={() => {}} />);
    expect(clerk).toContain(">編集</button>");
    expect(clerk).not.toContain("患者基本情報（住所・連絡先・家族・公費・介護保険・かかりつけ）の登録・変更は");
    const pharmacist = as("薬剤師", <PatientInfoPanel patient={oura} today={today} fmtDay={fmtDay} nowTime="10:00" contacts={INITIAL_CONTACTS[oura.id]} onSave={() => {}} />);
    expect(pharmacist).not.toContain(">編集</button>");
    expect(pharmacist).toContain("患者基本情報（住所・連絡先・家族・公費・介護保険・かかりつけ）の登録・変更は医事課・看護師・医師が行います");
    // Reading is for everyone.
    expect(pharmacist).toContain("田辺 幸子");
  });

  it("the patient bar's name opens it on a double-click (iPad: a long press)", () => {
    const html = renderToStaticMarkup(<PatientBar patient={sakura} today={today} diagnoses={[]} onOpenDiagnoses={() => {}} onOpenDirective={() => {}} onOpenInfo={() => {}} />);
    expect(html).toContain("ダブルクリック（iPad は長押し）で患者基本情報を開く");
    expect(html).toContain("佐倉 修の患者基本情報を開く");
    const without = renderToStaticMarkup(<PatientBar patient={sakura} today={today} diagnoses={[]} onOpenDiagnoses={() => {}} onOpenDirective={() => {}} />);
    expect(without).not.toContain("患者基本情報");
  });
});
