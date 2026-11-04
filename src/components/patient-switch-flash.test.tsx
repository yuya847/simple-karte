// 患者切替: nothing is drawn over the chart (the chart's tab pulses instead, by a CSS class added in the browser).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PatientSwitchFlash, placeLabel } from "./PatientSwitchFlash";

describe("PatientSwitchFlash", () => {
  it("renders nothing itself (no overlay card)", () => {
    const html = renderToStaticMarkup(<PatientSwitchFlash patient={{ id: "p3" }} />);
    expect(html).toBe("");
  });
  it("placeLabel", () => {
    expect(placeLabel("5階東", "508")).toBe("5階東 508");
    expect(placeLabel("外来", "外来")).toBe("外来");
    expect(placeLabel(undefined, "508")).toBe("508");
  });
});
