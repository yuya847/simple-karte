// マスタ管理 renders on the server with what the history says, and the order pickers follow it.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LAB_TESTS } from "@/lib/master";
import { addMasterChanges, changesFor, NO_OVERRIDES } from "@/lib/master-local";
import { PROCEDURES } from "@/lib/procedures";
import { STAFF, type Role } from "@/lib/roles";
import { MasterView } from "./MasterView";
import { AddLabPanel, AddProcedurePanel } from "./panels/AddPanels";
import { MeProvider, RoleProvider } from "./RoleContext";

const as = (role: Role, node: React.ReactNode) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{node}</MeProvider>
    </RoleProvider>,
  );
let n = 0;
const newId = () => `m${++n}`;

describe("マスタ管理の画面", () => {
  it("lists the drug master for everyone, and only the pharmacist may change it", () => {
    const doctor = as("医師", <MasterView nowTime="10:00" newId={newId} />);
    expect(doctor).toContain("大塚生食注 500mLソフトバッグ");
    expect(doctor).toContain("薬剤師が行います");
    expect(doctor).toContain("架空の病院の取り決め");
    expect(doctor).toContain("別紙様式1 項番161〜165");
    const pharmacist = as("薬剤師", <MasterView nowTime="10:00" newId={newId} />);
    expect(pharmacist).not.toContain("薬剤師が行います");
    expect(pharmacist).toContain("変えた品目はありません");
  });

  it("takes a 中止 out of the lab picker and shows a 院内名 in the procedure list at once", () => {
    const lab = LAB_TESTS.find((t) => t.group === "血液学" && t.abbr)!;
    const proc = PROCEDURES[0];
    // The lab picker opens on the 頻用 tab; the 血液学 items are on the 血液学・凝固系 tab (each a button with the name in a span).
    const before = renderToStaticMarkup(<AddLabPanel onAdd={() => {}} newId={newId} initialTab="heme" />);
    expect(before).toContain(`>${lab.abbr}</span>`);
    const meta = { reason: "試し", by: "検査技師 中村", role: "臨床検査技師", at: { day: 0, time: "10:00" } };
    addMasterChanges([...changesFor(NO_OVERRIDES, "検体検査", lab.code, { stopped: true }, meta, newId), ...changesFor(NO_OVERRIDES, "処置", proc.code, { localName: "院内の呼び名" }, meta, newId)]);
    const after = renderToStaticMarkup(<AddLabPanel onAdd={() => {}} newId={newId} initialTab="heme" />);
    expect(after).not.toContain(`>${lab.abbr}</span>`);
    expect(renderToStaticMarkup(<AddProcedurePanel onAdd={() => {}} newId={newId} />)).toContain("院内の呼び名");
    expect(as("臨床検査技師", <MasterView nowTime="10:00" newId={newId} />)).toContain("変更の履歴");
  });
});
