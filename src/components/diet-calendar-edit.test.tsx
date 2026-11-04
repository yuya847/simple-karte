import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DietCalendar } from "./DietCalendar";
import { can, denyReason } from "@/lib/roles";
import type { Patient } from "@/lib/types";

const patient = { id: "p", admittedOn: 0 } as Patient;
describe("食事カレンダーの編集権限", () => {
  for (const role of ["医師", "看護師", "管理栄養士"] as const) {
    it(`${role}は既存の食事権限に従う`, () => {
      const html = renderToStaticMarkup(<DietCalendar patient={patient} entries={[]} diets={[]} today={{ y: 2026, m: 11, d: 5 }} nowTime="06:00" dietEdit={{ denied: denyReason(role, "diet"), doctor: "医師", onDraft: () => {} }} />);
      expect(can(role, "diet")).toBe(role !== "看護師");
      if (role !== "看護師") expect(html).toContain("押して変える");
      else { expect(html).toContain("食事の指示は医師・管理栄養士が行います"); expect(html).not.toContain("押して変える"); }
    });
  }
});
