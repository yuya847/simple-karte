// The 医薬品集・DI screen renders (on the server) for a pharmacist (with the DI form) and for a nurse (without).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { INITIAL_NOTICES, INITIAL_READS } from "@/lib/board";
import { FormularyView } from "./FormularyView";
import { RoleProvider } from "./RoleContext";

const TODAY = { y: 2026, m: 11, d: 4 };
const view = (role: "薬剤師" | "看護師") =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <FormularyView notices={INITIAL_NOTICES} reads={INITIAL_READS} today={TODAY} nowTime="12:00" staff={["薬剤師 小林", "看護師 佐藤"]} onRead={() => {}} onPost={() => {}} />
    </RoleProvider>,
  );

describe("医薬品集・DI の画面", () => {
  it("lists the drugs with their 電子添文 and the DI notice with who has read it", () => {
    const html = view("看護師");
    expect(html).toContain("院内医薬品集・DI");
    expect(html).toContain("オキシコンチンTR錠5mg");
    expect(html).toContain("343018_8119002G5020_2_09");
    expect(html).toContain("既読 1/2人");
    expect(html).not.toContain("DI のお知らせを書く");
  });
  it("a pharmacist can write a DI notice", () => {
    expect(view("薬剤師")).toContain("DI のお知らせを書く");
  });
});
