// The flow sheet (経過表) renders (on the server, without a browser) for each fictional patient.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { INITIAL_CARE_ORDERS, initialCareRecords } from "@/lib/care-orders";
import { INITIAL_DIETS } from "@/lib/diet";
import { PATIENTS } from "@/lib/patients";
import { DEFAULT_LAYOUT, saveSet, toggleCollapsed } from "@/lib/flow-layout";
import { FlowGroup, FlowLayoutPanel } from "./FlowLayoutPanel";
import { FlowSheet } from "./FlowSheet";
import { FlowEntryPanel } from "./FlowEntryPanel";
import { VitalsPanel } from "./panels/VitalsPanel";
import type { OrderEntry } from "@/lib/types";

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

  it("lab values: the default analytes with H/L, and a draw waiting for its result", () => {
    const html = render("90010260", { pendingLabs: [{ at: 540, status: "検査中", analytes: ["CRP"], tests: "CRP", urgent: false }] });
    expect(html).toContain("出す検査値を選ぶ（WBC・CRP・Hb・Cre・K）");
    expect(html).toContain("9,800");
    expect(html).toContain("12");
    expect(html).toContain("検査中");
  });

  it("内服 by timing, and 血糖 from the 血糖測定 observations", () => {
    const kita = render("90010198", { mar: { records: {}, sessionStart: 540 } });
    expect(kita).toContain("定期・持参薬など、時刻の決まった分");
    expect(kita).toContain("済");
    expect(kita).not.toContain("血糖・インスリン");
    const sakura = render("90010231", { care: { orders: INITIAL_CARE_ORDERS.filter((o) => o.patientId === "90010231"), records: initialCareRecords(), sessionStart: 540 } });
    expect(sakura).toContain("血糖・インスリン");
    expect(sakura).toContain("186/214/198");
    expect(sakura).not.toContain(">血糖測定（簡易血糖測定器）<");
  });

  it("記録: the day's notes by who wrote them, and 記事を書く", () => {
    const html = render("90010244", { onOpenRecord: () => {}, onWriteNote: () => {} });
    expect(html).toContain("記事を書く");
    expect(html).toMatch(/医師の記載 \d+件を経過で開く/);
    expect(render("90010244")).not.toContain("記事を書く");
  });

  it("every period and time scale renders, items at their time when zoomed in", () => {
    const care = { orders: INITIAL_CARE_ORDERS.filter((o) => o.patientId === "90010244"), records: initialCareRecords(), sessionStart: 540 };
    const io = { typed: [], records: {}, sessionStart: 540, standingIo: null };
    for (const s of ["all", "week", "3d", "1d", "shift", "1h"] as const) {
      const html = render("90010244", { care, io, initialScale: s, mar: { records: {}, sessionStart: 540 } });
      expect(html).toContain("体温");
      expect(html).toContain("表示期間と時間の目盛り");
    }
    const day = render("90010244", { care, initialScale: "1d" });
    expect(day).toContain("12時");
    expect(day).toContain("前");
    expect(render("90010244", { initialScale: "1h" })).toContain("10:30");
    expect(render("90010244", { initialScale: "shift" })).toContain("日勤 8:30〜17:00");
  });

  it("groups with headings that fold, and the 行の設定 panel", () => {
    const html = render("90010244", { care: { orders: INITIAL_CARE_ORDERS.filter((o) => o.patientId === "90010244"), records: initialCareRecords(), sessionStart: 540 } });
    for (const t of ["バイタル", "観察・記録", "看護ケア・観察（看護師の指示）", "内服", "注射", "検体検査", "記録", "行の設定"]) expect(html).toContain(t);
    const layout = saveSet(toggleCollapsed(DEFAULT_LAYOUT, "inj"), "呼吸", ["痰の量"]);
    const panel = renderToStaticMarkup(<FlowLayoutPanel layout={layout} onLayout={() => {}} careItems={["口腔ケア", "痰の量"]} onClose={() => {}} />);
    expect(panel).toContain("観察項目のセット");
    expect(panel).toContain("呼吸（1行）");
    expect(panel).toContain("いま出している看護ケア・観察の行（1行）をセットに残す");
    const folded = renderToStaticMarkup(
      <FlowGroup id="inj" title="注射" layout={layout} onLayout={() => {}}>
        <p>中身</p>
      </FlowGroup>,
    );
    expect(folded).toContain("たたんでいます");
    expect(folded).not.toContain("中身");
  });

  it("cells open entries: pressable cells and 未受 for orders not yet taken", () => {
    const care = { orders: INITIAL_CARE_ORDERS.filter((o) => o.patientId === "90010231"), records: initialCareRecords(), sessionStart: 540 };
    const sakura = PATIENTS.find((x) => x.id === "90010231")!;
    const inj = sakura.history.find((e) => e.kind === "order" && e.order.type === "injection")!;
    const html = render("90010231", { care, onEntry: () => {}, untaken: [inj.kind === "order" ? inj.id : ""], mar: { records: {}, sessionStart: 540 } });
    expect(html).toContain("未受");
    expect(html).toContain("指示受けがまだのオーダ 1件");
    expect(html).toContain("指示受けを開く");
    expect(html).toMatch(/<button[^>]*>済<\/button>/);
    // Without onEntry the cells are only read.
    expect(render("90010231", { care })).not.toMatch(/<button[^>]*>済<\/button>/);
  });

  it("the entry drawer: the care record, the doses with the check, 指示受け", () => {
    const sakura = PATIENTS.find((x) => x.id === "90010231")!;
    const person = { patient: sakura, room: "512A", entries: sakura.history.filter((e): e is OrderEntry => e.kind === "order") };
    const base = { person, today, nowTime: "10:00", sessionStart: 300, interactive: true, care: { orders: INITIAL_CARE_ORDERS, records: initialCareRecords(), plans: [], onRecord: () => {}, onVoid: () => {} }, mar: { records: {}, voided: {}, queried: {}, onRecord: () => {}, onVoid: () => {} }, take: { rows: [], taken: {}, isTaken: () => false, holds: {}, nurses: [], onTake: () => {}, onHold: () => {} } };
    const careHtml = renderToStaticMarkup(<FlowEntryPanel {...base} req={{ kind: "care", item: "清拭", lo: -1440, hi: 0 }} />);
    expect(careHtml).toContain("清拭");
    const amlo = person.entries.find((e) => e.id === "sakura-amlo")!;
    const marHtml = renderToStaticMarkup(<FlowEntryPanel {...base} req={{ kind: "mar", orderIds: [amlo.id], lo: 480, hi: 481, label: "今日 朝（08:00）の内服" }} />);
    expect(marHtml).toContain("今日 朝（08:00）の内服");
    expect(marHtml).toContain("アムロジピン");
    expect(renderToStaticMarkup(<FlowEntryPanel {...base} req={{ kind: "take", orderIds: [] }} />)).toContain("受けていない指示はありません");
  });

  it("the vitals entry opens with the cell's time; without one it is now", () => {
    const at = renderToStaticMarkup(<VitalsPanel nowTime="10:00" onSave={() => {}} defaultAt={{ day: -1, time: "14:20" }} fmtDay={() => "11/3（火）"} />);
    expect(at).toContain("測った時刻");
    expect(at).toContain("14:20");
    expect(at).toContain("確定（11/3（火） 14:20）");
    expect(renderToStaticMarkup(<VitalsPanel nowTime="10:00" onSave={() => {}} />)).toContain("確定（10:00）");
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
