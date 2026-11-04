// 患者切替のカード renders (on the server, without a browser) the place once: "5階東 508" for a ward patient,
// just "外来" for an outpatient whose ward and room are the same word (not "外来 外来").
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PatientSwitchFlash, placeLabel } from "./PatientSwitchFlash";

describe("PatientSwitchFlash", () => {
  it("shows ward and room for a ward patient", () => {
    const html = renderToStaticMarkup(<PatientSwitchFlash patient={{ id: "p3", name: "北村 三郎", kana: "キタムラ サブロウ", age: 72, sex: "男", ward: "5階東", room: "508" }} />);
    expect(html).toContain("患者が切り替わりました");
    expect(html).toContain("北村 三郎");
    expect(html).toContain("<span>5階東 508</span>");
    expect(html).toContain("ID p3");
  });
  it("shows 外来 once when the ward and the room are the same word", () => {
    const html = renderToStaticMarkup(<PatientSwitchFlash patient={{ id: "opd:opd-1", name: "架空 花子", age: 45, sex: "女", ward: "外来", room: "外来" }} />);
    expect(html).not.toContain("外来 外来");
    expect(html).toContain("<span>外来</span>");
    expect(html).toContain("ID opd-1");
    const er = renderToStaticMarkup(<PatientSwitchFlash patient={{ id: "er:er-2", name: "架空 次郎", age: 76, sex: "男", ward: "救急外来", room: "救急外来" }} />);
    expect(er).not.toContain("救急外来 救急外来");
    expect(er).toContain("<span>救急外来</span>");
  });
  it("placeLabel", () => {
    expect(placeLabel("5階東", "508")).toBe("5階東 508");
    expect(placeLabel("外来", "外来")).toBe("外来");
    expect(placeLabel(undefined, "508")).toBe("508");
  });
});
