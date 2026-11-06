// The patient bar and the doctors' list render (on the server, without a browser) with the attending, the
// 担当医 and the コンサルト医, and only a doctor may add or remove.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { doctorsOf, INITIAL_DOCTOR_BOOK, involved, type OtherDoctor } from "@/lib/patient-doctors";
import { PATIENTS } from "@/lib/patients";
import { STAFF, type Role } from "@/lib/roles";
import { BEDS_WITH_CHARTS, WARD_CHART_PATIENTS } from "@/lib/ward-charts";
import { PatientBar } from "./PatientBar";
import { PatientList } from "./PatientList";
import { DOCTOR_CHOICES, DoctorsPanel } from "./panels/DoctorsPanel";
import { MeProvider, RoleProvider } from "./RoleContext";

const sakura = PATIENTS.find((p) => p.id === "90010231")!;
const today = { y: 2026, m: 11, d: 4 };
const pending: OtherDoctor = { name: "井上（腎臓内科）", role: "コンサルト医", department: "腎臓内科", since: { day: 0, time: "10:00" }, by: "山本（専攻医）", pending: true };
const doctors = doctorsOf(sakura.attending, INITIAL_DOCTOR_BOOK[sakura.id], [pending]);
const as = (role: Role, el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{el}</MeProvider>
    </RoleProvider>,
  );

describe("患者バーの医師", () => {
  it("lists the attending, then each 担当医 and コンサルト医, the provisional one as 依頼中", () => {
    const html = renderToStaticMarkup(<PatientBar patient={sakura} today={today} diagnoses={[]} onOpenDiagnoses={() => {}} onOpenDirective={() => {}} doctors={doctors} onOpenDoctors={() => {}} />);
    expect(html).toContain("主治医 山本（専攻医）");
    expect(html).toContain("／担当医 研修医 田中");
    expect(html).toContain("／コンサルト 中川（循環器内科）");
    expect(html).toContain("／コンサルト 井上（腎臓内科）（依頼中）");
    expect(html).toContain("主治医・担当医・コンサルト医の一覧を開く");
  });

  it("without the list it shows the attending alone, and the button is still (quietly) there", () => {
    const html = renderToStaticMarkup(<PatientBar patient={sakura} today={today} diagnoses={[]} onOpenDiagnoses={() => {}} onOpenDirective={() => {}} />);
    expect(html).toContain("主治医 山本（専攻医）");
    expect(html).not.toContain("担当医 研修医");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="患者の医師"/);
  });
});

describe("入院患者一覧：担当医・コンサルト医でも自分の患者に出る", () => {
  const all = [...PATIENTS, ...WARD_CHART_PATIENTS];
  const ward = { beds: BEDS_WITH_CHARTS, patient: (id: string) => all.find((p) => p.id === id) };
  const pdOf = (id: string) => doctorsOf(all.find((p) => p.id === id)!.attending, INITIAL_DOCTOR_BOOK[id]);
  const list = (viewer: string, group?: "doctor") =>
    renderToStaticMarkup(<PatientList ward={ward} title="入院患者一覧" nowTime="10:00" changes={{}} summaries={{}} waiting={{}} defaultGroup={group} mine={(id) => involved(viewer, pdOf(id))} doctorsOf={(id) => pdOf(id)} viewer={viewer} onOpen={() => {}} />);

  it("山本 sees 主治医 on his four, and コンサルト on the two other teams' patients he was asked about", () => {
    const html = list("山本（専攻医）");
    expect(html.match(/あなたはこの患者の主治医です/g)?.length).toBe(4);
    expect(html.match(/あなたはこの患者のコンサルト医です/g)?.length).toBe(2);
    // The two are full rows (受け持ち), not gray ones: their kana shows.
    for (const name of ["小池 隆", "村井 和子"]) expect(html).toContain(WARD_CHART_PATIENTS.find((p) => p.name === name)!.kana);
    expect(html.match(/押すとカルテが開きます/g)?.length).toBe(BEDS_WITH_CHARTS.length - 6);
    // The doctor column lists the others under the attending.
    expect(html).toContain("担当 研修医 田中");
    expect(html).toContain("コンサルト 中川（循環器内科）");
  });

  it("中川 (循環器内科) sees 主治医 on his own patients and コンサルト on 佐倉", () => {
    const html = list("中川（循環器内科）");
    expect(html.match(/あなたはこの患者のコンサルト医です/g)?.length).toBe(1);
    expect(html).toContain(sakura.kana);
  });

  it("主治医別 lists a patient under each of their doctors", () => {
    const html = list("山本（専攻医）", "doctor");
    expect(html).toMatch(/山本（専攻医）<span class="ml-2 font-normal">6人/);
    expect(html).toMatch(/研修医 田中<span class="ml-2 font-normal">2人/);
    expect(html).toMatch(/中川（循環器内科）<span class="ml-2 font-normal">\d+人/);
  });
});

describe("主治医・担当医・コンサルト医の一覧", () => {
  const panel = <DoctorsPanel doctors={doctors} fmtDay={(d) => `11/${4 + d}`} onAdd={() => {}} onRemove={() => {}} />;

  it("a doctor sees the list with who and when, and the form to add from the staff list", () => {
    const html = as("医師", panel);
    expect(html).toContain("研修医 田中");
    expect(html).toContain("11/1 09:00　山本（専攻医）　入院時から担当");
    expect(html).toContain("依頼中");
    expect(html).toContain("担当医として足す");
    expect(html).toContain("一覧にない医師（名前を入れる）");
    // The attending is not offered; the consult departments' doctors are.
    expect(html).not.toMatch(/<option value="山本（専攻医）"/);
    expect(html).toContain('<option value="中川（循環器内科）"');
    // The registered ones can be removed; the provisional one follows the order and cannot.
    expect(html.match(/外す<\/button>/g)?.length).toBe(2);
    expect(html).not.toContain("誰を足すかは医師が決めます");
  });

  it("a nurse sees the list but not the form", () => {
    const html = as("看護師", panel);
    expect(html).toContain("研修医 田中");
    expect(html).not.toContain("担当医として足す");
    expect(html).not.toContain("外す</button>");
    expect(html).toContain("担当医・コンサルト医の登録・変更");
  });

  it("the staff list has the ward's doctors and one doctor per consult department", () => {
    expect(DOCTOR_CHOICES.map((c) => c.name)).toContain("研修医 田中");
    expect(DOCTOR_CHOICES.find((c) => c.name === "中川（循環器内科）")?.department).toBe("循環器内科");
    // Departments without a fictional doctor (皮膚科 etc.) are left out rather than made up.
    expect(DOCTOR_CHOICES.some((c) => c.name === "皮膚科")).toBe(false);
  });
});
