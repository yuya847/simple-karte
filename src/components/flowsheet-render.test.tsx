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

  it("dates: 病日, 術後日数, 移動 and a counted day", () => {
    const html = render("90010231", {
      moves: [{ day: -3, time: null, label: "入院", tone: "ink" }, { day: 1, time: "10:00", label: "外泊（自宅）", tone: "yamabuki" }],
      dayInfo: {
        surgeries: [{ id: "s", patientId: "90010231", name: "佐倉 修", sex: "男", age: 1, ward: "", department: "", day: -1, room: "手術室1", start: "13:00", minutes: 60, procedure: "切開排膿", site: "", side: null, position: null, anesthesia: null, laparoscopic: false, kind: "予定", blood: "なし", after: "病棟", anesthesiaConsult: false, infections: [], allergies: [], status: "退室", requestedAt: 0 }],
        events: [{ id: "e", patientId: "90010231", label: "CEZ 開始", day: -3, by: "看護師 佐藤", at: { day: 0, time: "09:00" } }],
        meName: "看護師 佐藤",
        onAddEvent: () => {},
        onRemoveEvent: () => {},
      },
    });
    expect(html).toContain("1日目");
    expect(html).toContain("術後1日");
    expect(html).toContain("手術日");
    expect(html).toContain("外泊");
    expect(html).toContain("CEZ 開始");
    expect(html).toContain("+3日");
    expect(html).toContain("日数を数える日を足す");
  });
});
