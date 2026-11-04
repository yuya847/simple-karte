// The admission interview renders (on the server) and shows where its answers go.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptyAnamnesis, saveAnamnesis } from "@/lib/anamnesis";
import { PATIENTS } from "@/lib/patients";
import { STAFF, type Role } from "@/lib/roles";
import { AnamnesisPanel } from "./panels/AnamnesisPanel";
import { MeProvider, RoleProvider } from "./RoleContext";
import { ToolRail } from "./ToolRail";

const oura = PATIENTS.find((p) => p.id === "90010244")!;
const as = (role: Role, el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{el}</MeProvider>
    </RoleProvider>,
  );
const v1 = saveAnamnesis(undefined, oura.id, { ...emptyAnamnesis(), living: "独居", care: { 移動: "歩行器", 排泄: "一部介助" }, careInsurance: "なし（申請していない）", fallHistory: "あり" }, "看護師 佐藤", { day: -1, time: "20:00" }, "");
const v2 = saveAnamnesis(v1, oura.id, { ...v1.fields, keyPerson: "長女" }, "看護師 佐藤", { day: 0, time: "10:00" }, "長女から聞いた");

describe("入院時の情報収集", () => {
  it("the nurse finds it on the right rail", () => {
    expect(as("看護師", <ToolRail open="anamnesis" onOpen={() => {}} />)).toContain("情報収集");
  });

  it("a new interview starts from the help already in the profile", () => {
    const html = as("看護師", <AnamnesisPanel patient={oura} care={{ 移動: { value: "車椅子" } }} fmtDay={(d) => `${d}日`} onSave={() => {}} />);
    expect(html).toContain("まだ聞き取っていません");
    expect(html).toMatch(/aria-pressed="true"[^>]*>車椅子</);
    expect(html).toContain("退院後の生活の希望");
    expect(html).toContain("架空の病院の様式");
  });

  it("shows the versions with the reason and what changed, and where the answers go", () => {
    const html = as("看護師", <AnamnesisPanel patient={oura} record={v2} care={{}} fmtDay={(d) => `${d}日`} onSave={() => {}} />);
    expect(html).toContain("第2版");
    expect(html).toContain("理由：長女から聞いた");
    expect(html).toContain("キーパーソン（続柄・名前）：（なし） → 長女");
    expect(html).toContain("転倒・転落 転倒・転落歴・歩行時に介助が必要");
    expect(html).toContain("ウ（要介護・要支援の疑いがあるが認定が未申請");
    expect(html).toContain("患者プロファイルの介助：移動 歩行器・排泄 一部介助");
  });

  it("only the nurse writes it", () => {
    const doc = as("医師", <AnamnesisPanel patient={oura} record={v2} care={{}} fmtDay={(d) => `${d}日`} onSave={() => {}} />);
    expect(doc).toContain("入院時の情報収集（アナムネーシス）は看護師が行います");
    expect(doc).toContain("<fieldset disabled");
  });
});
