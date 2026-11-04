// 退院時の一括中止 renders (on the server, without a browser) with the groups it is given.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { remainingGroups } from "@/lib/discharge-stop";
import { PATIENTS } from "@/lib/patients";
import { ordersOf } from "@/lib/record";
import { STAFF } from "@/lib/roles";
import { initialStanding } from "@/lib/standing";
import { DischargeStops } from "./DischargeStops";
import { MeProvider, RoleProvider } from "./RoleContext";
import { ToolRail } from "./ToolRail";

const today = { y: 2026, m: 11, d: 4 };
const sakura = PATIENTS.find((p) => p.id === "90010231")!;
const groups = remainingGroups(ordersOf(sakura.history), 12 * 60, initialStanding()[sakura.id][0]);

describe("退院時の一括中止", () => {
  it("is a tool on the right rail", () => {
    const html = renderToStaticMarkup(
      <RoleProvider value="医師">
        <MeProvider value={STAFF.医師}>
          <ToolRail open="discharge-stop" onOpen={() => {}} />
        </MeProvider>
      </RoleProvider>,
    );
    expect(html).toContain("退院時の一括中止");
  });

  it("shows a doctor each group with a box to check (none checked) and the source", () => {
    const html = renderToStaticMarkup(<DischargeStops groups={groups} today={today} canStop onStop={() => {}} />);
    expect(html).toContain("退院のあとも残る指示");
    expect(html).toContain("指示簿（安静度・頓用・医師を呼ぶ基準・条件付き指示）");
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain("checked");
    expect(html).toContain("選んだグループを中止する");
    expect(html).toContain("退院一括削除");
  });

  it("shows others the list only", () => {
    const html = renderToStaticMarkup(<DischargeStops groups={groups} today={today} canStop={false} why="オーダの確定は医師が行います" onStop={() => {}} />);
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain("オーダの確定は医師が行います");
  });

  it("says so when nothing is left", () => {
    expect(renderToStaticMarkup(<DischargeStops groups={[]} today={today} canStop onStop={() => {}} />)).toContain("退院のあとも残る指示はありません");
  });
});
