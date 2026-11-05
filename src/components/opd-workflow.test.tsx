import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OPD_PATIENTS } from "@/lib/opd";
import { INITIAL_DESK } from "@/lib/billing/worklist";
import { STAFF } from "@/lib/roles";
import { RoleProvider, MeProvider } from "./RoleContext";
import { IjiBoard } from "./IjiBoard";
import { VisitStrip } from "./VisitStrip";
import { AddRxPanel } from "./panels/AddPanels";
import { OpdRxAfter } from "./OpdRxAfter";
const today = { y: 2026, m: 11, d: 5 };
const p = { ...OPD_PATIENTS[0], status: "会計待ち" as const };
const render = (child: React.ReactNode) => renderToStaticMarkup(<RoleProvider value="医師"><MeProvider value={STAFF.医師}>{child}</MeProvider></RoleProvider>);

describe("医事課・外来の受診", () => {
  const board = (paid: boolean) => render(<IjiBoard patients={[]} desk={INITIAL_DESK} diagnoses={{}} today={today} nowTime="10:30" payload={() => []} onOpen={() => {}} outpatient={{ visits: [{ patient: p, entries: [], rx: [], drafts: 1 }], book: paid ? { [`opd:${p.id}`]: { visitId: `opd:${p.id}`, receiptNo: "R1", points: 136, yen: 270, coverage: "医保", rateLabel: "2割", method: "現金", by: "医事課", at: { day: 0, time: "10:30" } } } : {}, onSettle: () => {} }} />);
  it("会計待ちの受診を算定・会計へつなぎ、入金済みは除く", () => {
    expect(board(false)).toContain('aria-label="外来の受診"');
    expect(board(false)).toContain("算定・会計へ");
    expect(board(false)).toContain(p.name);
    expect(board(false)).toContain("下書き 1");
    expect(board(true)).not.toContain(p.name);
  });
});
describe("患者バーの外来処方と共通ウインドウ", () => {
  it("外来処方と再診予約、会計を表示する", () => {
    const html = render(<VisitStrip visit={{ kind: "opd", op: p }} rxCount={1} fmtDay={String} canOrder onStatus={() => {}} onOpenRequest={() => {}} onCancelRequest={() => {}} onOpenChart={() => {}} onOpenRx={() => {}} onOpenRevisit={() => {}} onOpenBill={() => {}} />);
    expect(html).toContain("外来処方（1）");
    expect(html).toContain("再診予約");
    expect(html).toContain("会計（未収）");
  });
  it("共通の処方入力は院内・院外の区分を上に置き、直接薬名を入力できる", () => {
    const html = render(<AddRxPanel outpatient onAdd={() => {}} newId={() => "rx1"} />);
    expect(html).toContain('aria-label="院内／院外"');
    expect(html.indexOf('aria-label="院内／院外"')).toBeLessThan(html.indexOf('role="combobox"'));
    expect(html).not.toContain("処方を書く");
  });
  it("確定後の節に電子処方箋の無効理由を表示する", () => {
    const html = render(<OpdRxAfter op={p} entries={[]} legacy={[]} insuranceBook={{}} today={today} nowTime="10:30" national={[]} onRegistered={() => {}} />);
    expect(html).toContain("登録できない理由：");
    expect(html).toContain("確定した院外処方が必要です");
    expect(html).toContain("保険の登録が必要です");
    expect(html).toContain("重複投薬等チェック（模擬）を行ってください");
  });
});
