import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DietWindow } from "./DietWindow";
import { denyReason } from "@/lib/roles";
import type { Patient } from "@/lib/types";
import type { DietOrder } from "@/lib/diet";

const patient = { id: "p", admittedOn: 0 } as Patient;
const diet: DietOrder = { id: "d", patientId: "p", from: { day: -1, meal: "朝" }, kind: "常食", staple: "全粥", side: "一口大", prohibited: "卵", by: "医師", at: { day: -1, time: "09:00" } };
describe("食事ウインドウ", () => {
  for (const role of ["医師", "看護師", "管理栄養士"] as const) {
    it(`${role}の既存権限でカレンダーを表示する`, () => {
      const html = renderToStaticMarkup(<DietWindow patient={patient} entries={[]} diets={[diet]} today={{ y: 2026, m: 11, d: 6 }} nowTime="06:00" dietEdit={{ denied: denyReason(role, "diet"), doctor: "医師", onDraft: () => {} }} />);
      expect(html).toContain("現在の食事");
      expect(html).toContain("食事カレンダー");
      expect(html).toContain("全粥");
      expect(html).toContain("一口大");
      expect(html).toContain("禁止：卵");
      expect(html).toContain("右クリック（iPad は長押し）でその回から変えられます");
      const disabled = html.match(/disabled=""/g)?.length ?? 0;
      expect(disabled).toBe(role === "看護師" ? 22 : 0);
    });
  }
  it("配膳済みの食事は変えられない", () => {
    const html = renderToStaticMarkup(<DietWindow patient={patient} entries={[]} diets={[diet]} today={{ y: 2026, m: 11, d: 6 }} nowTime="13:00" dietEdit={{ denied: null, doctor: "医師", onDraft: () => {} }} />);
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});
