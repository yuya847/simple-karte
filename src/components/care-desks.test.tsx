// 給食・内視鏡室・チーム医療 render (on the server, without a browser) with what they are given.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { INITIAL_DIETS } from "@/lib/diet";
import { areasFor } from "@/lib/nav";
import { demoEndoOrders, demoEndoPatients, initialEndo } from "@/lib/endoscopy";
import { initialKitchen } from "@/lib/kitchen";
import { PATIENTS } from "@/lib/patients";
import { STAFF, type Role } from "@/lib/roles";
import { initialTeams } from "@/lib/teams";
import { bedPeople } from "@/lib/use-care-depts";
import { BEDS_WITH_CHARTS, OTHER_FLOOR_BEDS_WITH_CHARTS, WARD_CHART_PATIENTS, withChartDiets } from "@/lib/ward-charts";
import { EndoView } from "./EndoView";
import { KitchenView } from "./KitchenView";
import { TeamPanel } from "./panels/TeamPanel";
import { MeProvider, RoleProvider } from "./RoleContext";
import { TeamsView } from "./TeamsView";

const today = { y: 2026, m: 11, d: 4 }; // 水曜日
const nowTime = "13:00";
const NOW = 13 * 60;
const all = [...PATIENTS, ...WARD_CHART_PATIENTS];
const ids = demoEndoPatients(all);
const endoOrders = demoEndoOrders(ids, NOW);
const find = (id: string) => {
  const p = all.find((x) => x.id === id);
  return p && { ...p, history: [...p.history, ...(endoOrders[id] ?? [])] };
};
const people = bedPeople([...BEDS_WITH_CHARTS, ...OTHER_FLOOR_BEDS_WITH_CHARTS], find, (p) => p.history);
const diets = withChartDiets(INITIAL_DIETS);
const nameOf = (id: string) => all.find((p) => p.id === id)!.name;
const as = (role: Role, node: React.ReactNode) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{node}</MeProvider>
    </RoleProvider>,
  );
const kitchen = (role: Role, start?: Parameters<typeof KitchenView>[0]["start"]) => as(role, <KitchenView people={people} diets={diets} desk={initialKitchen()} onDesk={() => {}} today={today} nowTime={nowTime} start={start} />);
const endo = (role: Role, start?: Parameters<typeof EndoView>[0]["start"]) => as(role, <EndoView people={people} desk={initialEndo(ids, NOW)} onDesk={() => {}} pathology={[]} onAddPath={() => {}} onGoPath={() => {}} acks={{}} today={today} nowTime={nowTime} start={start} />);
const teams = (role: Role, start?: Parameters<typeof TeamsView>[0]["start"]) => as(role, <TeamsView people={people} desk={initialTeams()} onDesk={() => {}} diagnoses={{}} diets={diets} today={today} nowTime={nowTime} onOpen={() => {}} start={start} />);

describe("場所", () => {
  it("内視鏡室 is for doctors and nurses, 給食 for the 管理栄養士 (doctors and nurses read), チーム医療 for all but 医事課", () => {
    const keys = (r: Role) => areasFor(r).map((a) => a.key);
    expect(keys("医師")).toEqual(expect.arrayContaining(["endo", "kitchen", "teams"]));
    expect(keys("看護師")).toEqual(expect.arrayContaining(["endo", "kitchen", "teams"]));
    expect(keys("管理栄養士")).toEqual(expect.arrayContaining(["kitchen", "teams"]));
    expect(keys("管理栄養士")).not.toContain("endo");
    expect(keys("薬剤師")).toContain("teams");
    expect(keys("医事課")).not.toContain("teams");
    expect(keys("MSW")).not.toContain("kitchen");
  });
});

describe("栄養部門（給食）", () => {
  it("counts the meals of every ward by 食種, with the 特別食 and the holds", () => {
    expect(people.length).toBeGreaterThan(50);
    const html = kitchen("管理栄養士");
    expect(html).toContain("食種（献立の系）");
    expect(html).toContain("減塩食");
    expect(html).toContain("うち特別食（特別食加算の対象）");
    expect(html).toContain("6階東病棟");
    expect(html).toContain("食数表を印刷");
    expect(html).toContain("低たんぱくご飯");
  });
  it("shows the week's 献立 of a 食種 with its values, and the notice's rule that a 特別食 needs a 献立表", () => {
    const html = kitchen("管理栄養士", "menu");
    expect(html).toContain("基本の献立");
    expect(html).toContain("みそ汁（豆腐・わかめ）");
    expect(html).toContain("特別食の献立表が作成されている必要がある");
  });
  it("makes 食札 with the 食種, the allergies of the chart and the 禁止食品, and only the 管理栄養士 records", () => {
    const html = kitchen("管理栄養士", "tickets");
    expect(html).toContain(nameOf("90010198"));
    expect(html).toContain("アレルギー（カルテ）：NSAIDs（喘息発作）");
    expect(html).toContain("減塩食（心臓疾患）（塩分6g未満）");
    expect(html).toContain("特別食");
    expect(html).toContain("ごま");
    expect(html).toContain("食札を印刷");
    expect(kitchen("看護師", "tickets")).toContain("管理栄養士が行います");
  });
  it("checks each patient's menu against the order and, for 常食, the 食事摂取基準", () => {
    const html = kitchen("管理栄養士", "check");
    expect(html).toContain("特別食（減塩食）");
    expect(html).toContain("食事摂取基準とも比べる");
    expect(html).not.toContain("推奨量");
    expect(html).not.toContain("目標量");
  });
  it("orders tomorrow's shortage in packs as a mock", () => {
    const html = kitchen("管理栄養士", "order");
    expect(html).toContain("模擬：業者にはつながっていません");
    expect(html).toContain("牛肉");
    expect(html).toContain("品目を発注する（模擬）");
  });
  it("asks for the 検食 of meals already served", () => {
    const html = kitchen("医師", "kenshoku");
    expect(html).toContain("検食簿");
    expect(html).toContain("配膳の時刻を過ぎて、検食の記録がありません");
    expect(html).not.toContain("検食簿の記入は");
  });
});

describe("内視鏡室", () => {
  it("lists today's endoscopies for 予約・受付", () => {
    const html = endo("看護師");
    expect(html).toContain("受付（来室した）");
    expect(html).toContain(nameOf(ids[3]));
    expect(html).toContain("消化器内科 石川");
  });
  it("records 前処置・鎮静・観察 (nurses) and the 実施記録 (doctors) with only reprocessed scopes", () => {
    const html = endo("看護師", "exam");
    expect(html).toContain("腸管洗浄剤");
    expect(html).toContain("鎮静薬を記録");
    expect(html).toContain("内視鏡の実施記録・監視解除・レポート・病理への提出は医師が行います");
    expect(html).toContain("CF-01（使用可）");
  });
  it("shows the scopes, today's check of the disinfectant and the reprocessing history with the guideline's items", () => {
    const html = endo("看護師", "scope");
    expect(html).toContain("GIF-02");
    expect(html).toContain("漏水テスト待ち");
    expect(html).toContain("今日の確認がまだです");
    expect(html).toContain("洗浄消毒機番号");
    expect(html).toContain("最低使用濃度以上（08:10");
  });
  it("lets the doctor write the report and send the biopsy to 病理", () => {
    const html = endo("医師", "report");
    expect(html).toContain("病理への提出（生検 2個）");
    expect(html).toContain("病理へ依頼を出す（組織診・内視鏡下生検）");
  });
  it("shows whether the ordering doctor has read the report", () => {
    const html = endo("医師", "read");
    expect(html).toContain("胃潰瘍（活動期、出血の跡なし）");
    expect(html).toContain("まだ");
  });
});

describe("チーム医療", () => {
  it("shows each team's requests and the proposals waiting for the attending", () => {
    const html = teams("看護師");
    expect(html).toContain("主治医の採否を待っている提案（1）");
    expect(html).toContain("ゼリー（嚥下調整食 コード0j）");
    expect(html).toContain("A233-2 栄養サポートチーム加算（週1回）");
  });
  it("shows the NST's fee with its conditions, this week's rounds and what the record shows", () => {
    const html = teams("管理栄養士", "nst");
    expect(html).not.toContain("ア 栄養スクリーニングの結果を踏まえ");
    expect(html).toContain("今週（日〜土）の回診 1回：栄養サポートチーム加算は週1回まで");
    expect(html).toContain("食事の指示が絶食");
    expect(html).toContain("回診を記録する");
  });
  it("shows that ICT has no per-patient fee, and the request waiting to be taken", () => {
    const html = teams("薬剤師", "ict");
    expect(html).toContain("感染対策向上加算（A234-2）");
    expect(html).toContain("依頼を受ける");
    expect(html).toContain(nameOf("90010231"));
  });
  it("in the chart: the doctor asks a team and adopts or not; a nurse cannot", () => {
    const panel = (role: Role) => as(role, <TeamPanel patientId="90010244" patientName={nameOf("90010244")} desk={initialTeams()} onDesk={() => {}} today={today} nowTime={nowTime} />);
    const doctor = panel("医師");
    expect(doctor).toContain("依頼する");
    expect(doctor).toContain("不採用の理由");
    expect(doctor).toContain("採用　昨日 17:00");
    expect(doctor).toContain("このチームへの依頼がもうあります");
    expect(panel("看護師")).toContain("チーム医療への依頼は医師が行います");
  });
});
