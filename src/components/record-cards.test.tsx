// The left record as cards (server render): the heading with 【種類】 date and time and the department・place,
// the version line, the bodies by kind, the folding buttons, and the visits before the admission under the stay.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { visitsOf } from "@/lib/opd-history";
import { PATIENTS } from "@/lib/patients";
import { STAFF, type Role } from "@/lib/roles";
import type { OrderEntry } from "@/lib/types";
import { DateTree } from "./DateTree";
import { HistoryPane, orderMark } from "./HistoryPane";
import { MeProvider, RoleProvider } from "./RoleContext";

const sakura = PATIENTS.find((p) => p.id === "90010231")!;
const kitamura = PATIENTS.find((p) => p.id === "90010198")!;
const today = { y: 2026, m: 11, d: 4 };
const as = (role: Role, el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{el}</MeProvider>
    </RoleProvider>,
  );
const base = { today, selectedDay: null, showStopped: false, onToggleStopped: () => {} };

describe("経過のカード", () => {
  const html = as("医師", <HistoryPane {...base} patient={sakura} entries={sakura.history} onDo={() => {}} />);
  it("each record is a card: 【記事】【注射】【検体検査】【処方】 with the date (weekday) and time, the place small on the right, and a version line", () => {
    expect(html).toContain("【記事】 11/1（日） 14:20");
    expect(html).toContain("【注射】 11/1（日） 14:35");
    expect(html).toContain("【検体検査】 11/1（日） 14:30");
    expect(html).toContain("【処方】");
    expect(html).toContain(">総合診療科 病棟<");
    expect(html).toContain("第1版：");
    expect(html).toContain("記録 11/1（日） 14:20");
    expect(html).toContain("記載 11/1（日） 14:20");
    expect(html).toContain(">医師</span>");
  });
  it("a note's S)O)A)P) rows, a prescription's Rp number, amount on the right and 【服用開始日】, an injection's 【開始】, a lab's ・items", () => {
    expect(html).toContain(">S)</dt>");
    expect(html).toContain(">P)</dt>");
    expect(html).toContain(">Rp1<");
    expect(html).toContain("1回1錠");
    expect(html).toContain("【服用開始日：");
    expect(html).toContain("【開始：11/1（日） 15:30】");
    expect(html).toContain("・WBC");
    expect(html).toContain('aria-label="検査の内訳"');
  });
  it("the folding buttons and each card's ▸ are there, and the drag handle for Do", () => {
    expect(html).toContain("すべて展開");
    expect(html).toContain("すべてたたむ");
    expect(html).toContain('aria-label="記事をたたむ"');
    expect(html).toContain('aria-label="注射をたたむ"');
    expect(html).toContain('draggable="true"');
    expect(html).toContain('aria-label="記事のメニュー"');
  });
  it("the marks by kind of order", () => {
    const o = (order: OrderEntry["order"]) => orderMark(order);
    expect(o({ type: "procedure", code: "PROC-OPD", opd: { dept: "x", day: 1, slot: "午前", purpose: "再診" }, schedule: { kind: "once" }, start: { day: 1 } })).toBe("外来予約");
    expect(o({ type: "procedure", code: "PROC-CONSULT", consult: { dept: "皮膚科", question: "?", urgency: "通常" }, schedule: { kind: "once" }, start: { day: 0 } })).toBe("他科依頼");
    expect(o({ type: "procedure", code: "PROC-O2", schedule: { kind: "continuous" }, start: { day: 0 } })).toBe("処置");
  });
});

describe("入院前の外来の受診", () => {
  const visits = visitsOf(sakura.id, sakura.admittedOn);
  const html = as("看護師", <HistoryPane {...base} patient={sakura} entries={sakura.history} visits={visits} todayBookings={[{ day: 0, time: "10:30", kind: "画像", label: "CT 胸部", done: false }]} />);
  it("the visits come under the stay with the clinic's mark, the place 外来 on their cards, and 入院の◯日前", () => {
    expect(html).toContain("外来・総合診療科 山本（専攻医）");
    expect(html).toContain(">総合診療科 外来<");
    expect(html).toContain("入院の2日前");
    expect(html).toContain("入院の42日前");
    expect(html).toContain("右下腿蜂窩織炎（軽症）");
    expect(html.indexOf("入院1日目")).toBeLessThan(html.indexOf("外来・総合診療科"));
    expect(html).toContain('data-place="opd"');
  });
  it("today's bookings are listed under today's heading", () => {
    expect(html).toContain("今日の予定（予約のオーダ）");
    expect(html).toContain("CT 胸部");
    expect(html.indexOf("今日の予定")).toBeLessThan(html.indexOf("入院1日目"));
  });
  it("the date tree lists 入院前の外来 under 今回入院", () => {
    const tree = renderToStaticMarkup(<DateTree patient={kitamura} entries={kitamura.history} today={today} selectedDay={null} onSelect={() => {}} visits={visitsOf(kitamura.id, kitamura.admittedOn).map((v) => ({ day: v.day, dept: v.dept }))} />);
    expect(tree).toContain("入院前の外来");
    expect(tree).toContain("2回");
    expect(tree).toContain("循環器内科");
    expect(tree.indexOf("今回入院")).toBeLessThan(tree.indexOf("入院前の外来"));
  });
});
