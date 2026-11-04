// The flow sheet (経過表) renders (on the server, without a browser) for each fictional patient.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { INITIAL_DIETS } from "@/lib/diet";
import { PATIENTS } from "@/lib/patients";
import { FlowSheet } from "./FlowSheet";

const today = { y: 2026, m: 11, d: 4 };
const render = (id: string, extra: Partial<Parameters<typeof FlowSheet>[0]> = {}) => {
  const p = PATIENTS.find((x) => x.id === id)!;
  return renderToStaticMarkup(<FlowSheet patient={p} entries={p.history} today={today} nowTime="10:00" selectedDay={null} onSelectDay={() => {}} diets={INITIAL_DIETS} {...extra} />);
};

describe("経過表の画面", () => {
  it("renders for every fictional patient", () => {
    for (const p of PATIENTS) expect(render(p.id)).toContain("体温");
  });

  it("食種 from the diet orders", () => {
    const html = render("90010198");
    expect(html).toContain("食種");
    expect(html).toContain("心臓食 塩6g");
    expect(render("90010244")).toContain("絶食");
  });
});
