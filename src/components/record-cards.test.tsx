// The left record as cards (server render): the heading with 【種類】 date and time and the department・place,
// the version line, the bodies by kind, the folding buttons, and the visits before the admission under the stay.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { visitsOf } from "@/lib/opd-history";
import { PATIENTS } from "@/lib/patients";
import { plannedItems } from "@/lib/schedule-days";
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
    expect(html).toContain("ヴィーンF輸液 500mL");
    expect(html).not.toContain("酢酸リンゲル液（ヴィーンF）");
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
  it("each card's ▸ is there, and the drag handle for Do (no 「すべて展開／たたむ」 buttons)", () => {
    expect(html).not.toContain("すべて展開");
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
  // A CT ordered yesterday for today 10:30 (the plan is given by hand; the record needs the order among its entries).
  const ct: OrderEntry = { kind: "order", id: "o-ct", day: -1, time: "17:00", author: "山本（専攻医）", status: "有効", order: { type: "imaging", modality: "CT", region: "R-CHEST", purpose: "x", when: { day: 0, time: "10:30", priority: "予約" }, transport: "車椅子" } };
  const html = as("看護師", <HistoryPane {...base} patient={sakura} entries={[...sakura.history, ct]} visits={visits} planned={[{ day: 0, time: "10:30", kind: "画像", verb: "撮影", label: "CT 胸部", orderId: "o-ct", orderedOn: -1 }]} />);
  it("the visits come under the stay with the clinic's mark, the place 外来 on their cards, and 入院の◯日前", () => {
    expect(html).toContain("外来・総合診療科 山本（専攻医）");
    expect(html).toContain(">総合診療科 外来<");
    expect(html).toContain("入院の2日前");
    expect(html).toContain("入院の42日前");
    expect(html).toContain("右下腿蜂窩織炎（軽症）");
    expect(html.indexOf("入院1日目")).toBeLessThan(html.indexOf("外来・総合診療科"));
    expect(html).toContain('data-place="opd"');
  });
  it("today's plans (ordered on another day) are listed under today's heading, with 依頼 and the day it was ordered", () => {
    expect(html).toContain("今日の予定");
    expect(html).toContain("CT 胸部");
    expect(html).toContain("依頼 11/3（火）");
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

describe("依頼日と実施日", () => {
  const lab: OrderEntry = { kind: "order", id: "o-lab-next", day: -1, time: "17:30", author: "山本（専攻医）", status: "有効", order: { type: "lab", codes: ["LAB-CBC"], collect: { day: 1, time: "06:00" }, priority: "定時" } };
  const mri: OrderEntry = { kind: "order", id: "o-mri-next", day: 0, time: "09:10", author: "山本（専攻医）", status: "有効", order: { type: "imaging", modality: "MRI", region: "R-LEG", contrast: "単純", purpose: "膿瘍の有無", when: { day: 7, time: "10:00", priority: "予約" }, transport: "車椅子" } };
  const old: OrderEntry = { kind: "order", id: "o-lab-old", day: -3, time: "14:30", author: "山本（専攻医）", status: "実施済", order: { type: "lab", codes: ["LAB-CRP"], collect: { day: -1, time: "06:00" }, priority: "定時" } };
  const entries = [...sakura.history, lab, mri, old];
  const planned = plannedItems(entries, [{ id: "or-9", day: 7, start: "09:00", procedure: "デブリードマン" }]);
  const html = as("医師", <HistoryPane {...base} patient={sakura} entries={entries} planned={planned} nowTime="10:00" />);
  it("the order's card (on the day it was written) says in its heading when it is carried out: 採取予定 for a draw ahead, 採取 for one past", () => {
    expect(html).toContain("採取予定 11/5（木） 06:00");
    expect(html).toContain("撮影予定 11/11（水） 10:00");
    expect(html).toContain("採取 11/3（火） 06:00");
    expect(html).toContain('data-order-id="o-lab-next"');
  });
  it("the days ahead are one folded line above today by default — 「予定 N日 — 次は …」 — so today's section is the first seen", () => {
    expect(html).toContain("予定 2日 — 次は 11/5（木） 検体検査");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("data-future");
    expect(html).not.toContain("11/11（水）の予定");
    expect(html.indexOf("予定 2日")).toBeLessThan(html.indexOf("入院4日目（今日）"));
  });
  it("opened (a day ahead chosen in the date tree), each day it happens gets a section of its own ahead of today, with the plan and 「依頼 …」 to go to the card; an operation says where it comes from", () => {
    const open = as("医師", <HistoryPane {...base} selectedDay={7} patient={sakura} entries={entries} planned={planned} nowTime="10:00" />);
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain("data-future");
    expect(open).toContain('aria-label="11/11（水）の予定"');
    expect(open).toContain("入院11日目（予定）");
    expect(open).toContain("依頼 11/4（水）");
    expect(open).toContain("デブリードマン");
    expect(open).toContain("手術の予定表から");
    expect(open).toContain('aria-label="11/5（木）の予定"');
    expect(open).toContain("依頼 11/3（火）");
    expect(open.indexOf("11/11（水）の予定")).toBeLessThan(open.indexOf("11/5（木）の予定"));
    expect(open.indexOf("11/5（木）の予定")).toBeLessThan(open.indexOf("入院4日目（今日）"));
  });
  it("an order written and carried out the same day, already past, needs no mark; a past day's section carries what was planned on it", () => {
    // A draw ordered yesterday 14:30 and collected yesterday 14:40: no 採取 mark on its card.
    const same: OrderEntry = { kind: "order", id: "o-same", day: -1, time: "14:30", author: "山本（専攻医）", status: "実施済", order: { type: "lab", codes: ["LAB-CRP"], collect: { day: -1, time: "14:40" }, priority: "至急" } };
    const first = as("医師", <HistoryPane {...base} patient={sakura} entries={[same]} planned={plannedItems([same])} nowTime="10:00" />);
    expect(first).toContain('data-order-id="o-same"');
    expect(first).not.toContain("data-exec-mark");
    expect(first).not.toMatch(/aria-label="[^"]*の予定"/);
    expect(html).toContain('aria-label="11/3（火）の予定"');
    expect(html).toContain("依頼 11/1（日）");
  });
  it("the date tree lists the days ahead with plans under 予定 (not the past ones), with the kind or the count", () => {
    const tree = renderToStaticMarkup(<DateTree patient={sakura} entries={entries} today={today} selectedDay={null} onSelect={() => {}} planned={planned} />);
    expect(tree).toContain('aria-label="予定のある日"');
    expect(tree).toContain("11/5（木）");
    expect(tree).toContain(">検体検査<");
    expect(tree).toContain("11/11（水）");
    expect(tree).toContain(">予定 2<");
    expect(tree).toContain("2日</span>");
    expect(tree.indexOf("今回入院")).toBeLessThan(tree.indexOf("予定のある日"));
    // The record's filter reaches the tree: without the lab order among the entries, 11/5 goes.
    const filtered = renderToStaticMarkup(<DateTree patient={sakura} entries={entries.filter((e) => e.kind !== "order" || e.id !== "o-lab-next")} today={today} selectedDay={null} onSelect={() => {}} planned={planned} />);
    expect(filtered).not.toContain("11/5（木）");
    expect(filtered).toContain("11/11（水）");
    // A day ahead can be the chosen one.
    const chosen = renderToStaticMarkup(<DateTree patient={sakura} entries={entries} today={today} selectedDay={7} onSelect={() => {}} planned={planned} />);
    expect(chosen).toContain('aria-current="date"');
  });
});

describe("同時に出した処方のまとまり", () => {
  const rx = (id: string, changes: Partial<OrderEntry> = {}): OrderEntry => ({
    kind: "order", id, day: 0, time: "16:00", author: "山本（専攻医）", status: "有効",
    order: { type: "prescription", category: "定期", drugCode: "RX-AMLO", amount: 1, unit: "錠", timings: ["朝"], start: { day: 0, timing: "朝" }, rp: id },
    ...changes,
  });
  const render = (entries: OrderEntry[], patient = sakura) => as("医師", <HistoryPane {...base} showStopped patient={patient} entries={entries} onDo={() => {}} />);
  it("見出し・版・状態・共通開始日は1回、RpとDo・メニューは各行に残す", () => {
    const html = render([rx("a"), rx("b"), rx("c")]);
    expect(html.match(/【処方】/g)).toHaveLength(1);
    expect(html.match(/第1版：/g)).toHaveLength(1);
    expect(html.match(/服用開始日：/g)).toHaveLength(1);
    expect(html.match(/>有効</g)).toHaveLength(1);
    expect(html.match(/aria-label="処方をたたむ"/g)).toHaveLength(1);
    expect(html.match(/aria-label="オーダのメニュー"/g)).toHaveLength(3);
    for (const [i, id] of ["a", "b", "c"].entries()) {
      expect(html).toContain(`>Rp${i + 1}<`);
      expect(html).toContain(`data-order-id="${id}" draggable="true"`);
    }
  });
  it("2つのRpの共通の服用開始チップは見出しに1回だけ出し、メニューは用量の横に置く", () => {
    const entries = [rx("a"), rx("b")];
    for (const entry of entries) {
      entry.day = -1;
    }
    const html = render(entries);
    expect(html.match(/data-exec-mark/g)).toHaveLength(1);
    expect(html.match(/服用開始(?:予定)? /g)).toHaveLength(1);
    expect(html.match(/服用開始日：/g)).toHaveLength(1);
    expect(html.indexOf("data-exec-mark")).toBeLessThan(html.indexOf('data-order-id="a"'));
    expect(html.match(/1回1錠<\/span><button[^>]*aria-label="オーダのメニュー"/g)).toHaveLength(2);
  });
  it("服用開始が異なると共通チップを見出しに出さず各行に残す", () => {
    const first = rx("a", { day: -1 });
    const second = rx("b", { day: -1 });
    if (second.order.type === "prescription") second.order.start = { day: 1, timing: "朝" };
    const html = render([first, second]);
    expect(html.match(/data-exec-mark/g)).toHaveLength(2);
    expect(html.indexOf("data-exec-mark")).toBeGreaterThan(html.indexOf('data-order-id="a"'));
  });
  it("状態と開始日が異なれば各行に示す", () => {
    const second = rx("b", { status: "中止", stoppedOn: 0 });
    if (second.order.type === "prescription") second.order.start = { day: 1 };
    const html = render([rx("a"), second]);
    expect(html.match(/【処方】/g)).toHaveLength(1);
    expect(html.match(/服用開始日：/g)).toHaveLength(2);
    expect(html).toContain(">有効<");
    expect(html).toContain("中止（今日）");
    expect(html).toContain("line-through");
  });
  it("退院時・外来でも同じカード表示になる", () => {
    const entries = [rx("a"), rx("b")].map((e) => ({ ...e, order: { ...e.order, category: "退院時" as const } }));
    expect(render(entries).match(/【処方】/g)).toHaveLength(1);
    expect(render(entries, { ...sakura, id: "opd:test", ward: "外来" }).match(/【処方】/g)).toHaveLength(1);
  });
});
