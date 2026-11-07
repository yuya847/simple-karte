// 右の道具の「ICU 記録」は ICU・HCU の患者（今日まで入室していた患者を含む）だけに出す。
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { saveRail } from "@/lib/rail";
import { STAFF } from "@/lib/roles";
import { MeProvider, RoleProvider } from "./RoleContext";
import { ToolRail } from "./ToolRail";

const doctor = (el: React.ReactElement) => renderToStaticMarkup(<RoleProvider value="医師"><MeProvider value={STAFF["医師"]}>{el}</MeProvider></RoleProvider>);

describe("右の道具の ICU 記録", () => {
  it("出さない患者では、道具の列にもお気に入りにも出ない", () => {
    saveRail(STAFF["医師"].name, { mode: "icons", pins: ["icu"] });
    expect(doctor(<ToolRail open={null} onOpen={() => {}} />)).toContain("ICU 記録");
    expect(doctor(<ToolRail open={null} onOpen={() => {}} unavailable={["icu"]} />)).not.toContain("ICU 記録");
  });
});
