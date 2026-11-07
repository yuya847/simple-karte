// 経過と下書きの欄で「囲んで選ぶ」(server render): each card says which record it is (data-pick), nothing is
// chosen at first, and the list the box is drawn in is positioned for it.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { STAFF, type Role } from "@/lib/roles";
import { HistoryPane } from "./HistoryPane";
import { MeProvider, RoleProvider } from "./RoleContext";

const sakura = PATIENTS.find((p) => p.id === "90010231")!;
const today = { y: 2026, m: 11, d: 4 };
const as = (role: Role, el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{el}</MeProvider>
    </RoleProvider>,
  );
const base = { today, selectedDay: null, showStopped: false, onToggleStopped: () => {} };

describe("経過のカードを選ぶ", () => {
  const html = as("医師", <HistoryPane {...base} patient={sakura} entries={sakura.history} onDo={() => {}} />);
  it("記事は n:、オーダは o:（Rp のまとまりの中の1行ずつ）で、どのカードも選べる", () => {
    const keys = [...html.matchAll(/data-pick="([^"]+)"/g)].map((m) => m[1]);
    expect(keys.some((k) => k.startsWith("n:"))).toBe(true);
    expect(keys.some((k) => k.startsWith("o:"))).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    const orders = sakura.history.filter((e) => e.kind === "order").length;
    expect(keys.filter((k) => k.startsWith("o:")).length).toBe(orders);
  });
  it("最初は何も選ばれていない。四角は一覧のスクロールの中に描く", () => {
    expect(html).not.toContain("data-picked");
    expect(html).not.toContain("data-marquee");
    expect(html).toContain("scroll-thin relative min-h-0 flex-1 overflow-y-auto");
  });
});
