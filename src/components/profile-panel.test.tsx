// The patient profile renders (on the server, without a browser) with what it is given, and each role
// sees what it may change.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { applyProfile, type ProfileChange } from "@/lib/profile";
import { STAFF, type Role } from "@/lib/roles";
import { PatientBar } from "./PatientBar";
import { ProfilePanel } from "./panels/ProfilePanel";
import { MeProvider, RoleProvider } from "./RoleContext";
import { ToolRail } from "./ToolRail";

const sakura = PATIENTS.find((p) => p.id === "90010231")!;
const today = { y: 2026, m: 11, d: 4 };
const log: ProfileChange[] = [
  { id: "c1", patientId: sakura.id, by: "薬剤師 小林", role: "薬剤師", at: { day: 0, time: "09:00" }, kind: "contra", op: "追加", text: "NSAIDs（腎機能低下）" },
  { id: "c2", patientId: sakura.id, by: "看護師 佐藤", role: "看護師", at: { day: 0, time: "09:30" }, kind: "care", key: "移動", value: "車椅子" },
];
const as = (role: Role, el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{el}</MeProvider>
    </RoleProvider>,
  );

describe("患者プロファイル", () => {
  it("the tool is on the right rail", () => {
    expect(as("看護師", <ToolRail open="profile" onOpen={() => {}} />)).toContain("プロファイル");
  });

  it("the band shows 禁忌 and the help needed, and opens the profile", () => {
    const html = renderToStaticMarkup(<PatientBar patient={applyProfile(sakura, log)} today={today} diagnoses={[]} onOpenDiagnoses={() => {}} onOpenDirective={() => {}} onOpenProfile={() => {}} />);
    expect(html).toContain("禁忌");
    expect(html).toContain("NSAIDs（腎機能低下）");
    expect(html).toContain("移動：車椅子");
    expect(html).toContain("患者プロファイルを開く");
  });

  it("shows each item with who registered it, which checks use it, and the history", () => {
    const html = as("医師", <ProfilePanel base={sakura} log={log} fmtDay={(d) => `${d}日`} onChange={() => {}} />);
    expect(html).toContain("ヨード造影剤（蕁麻疹）");
    expect(html).toContain("前からの記録");
    expect(html).toContain("オーダの確認に使われます：造影の画像検査（「造影剤」）");
    expect(html).toContain("今日 09:00 薬剤師 小林");
    expect(html).toContain("禁忌を追加：NSAIDs（腎機能低下）");
    expect(html).toContain("介助（移動）：未登録 → 車椅子");
    expect(html).not.toContain("架空の病院の取り決め");
  });

  it("each role may change only its part (架空の病院の取り決め)", () => {
    const nurse = as("看護師", <ProfilePanel base={sakura} log={log} fmtDay={(d) => `${d}日`} onChange={() => {}} />);
    expect(nurse).toContain("血液型の登録は医師・臨床検査技師が行います");
    expect(nurse).toContain("禁忌の登録・変更は医師・薬剤師が行います");
    expect(nurse).not.toContain("アレルギーの登録・変更は");
    const clerk = as("医事課", <ProfilePanel base={sakura} log={log} fmtDay={(d) => `${d}日`} onChange={() => {}} />);
    expect(clerk).toContain("アレルギーの登録・変更は医師・看護師・薬剤師・管理栄養士が行います");
    expect(clerk).not.toContain(">登録</button>");
  });
});
