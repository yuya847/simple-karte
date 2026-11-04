// 「自分の目で確かめた」 before taking an order: the whole label is the target, the button says what it
// waits for, and the ○ of an order block is a 32px label. Rendered on the server (without a browser).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TakeRow } from "@/lib/order-take";
import { PATIENTS } from "@/lib/patients";
import { demoRisOrders, initialRisDesk, risRows } from "@/lib/ris";
import { risConfirmItems } from "@/lib/ris-take";
import { STAFF, type Role } from "@/lib/roles";
import type { OrderEntry } from "@/lib/types";
import { BlockCheck, CHECK_FIRST, ConfirmCheck, WAITING_BUTTON } from "./ConfirmCheck";
import { SheetBlock } from "./OrderSheet";
import { RisConfirmPanel } from "./RadiologyTake";
import { MeProvider, RoleProvider } from "./RoleContext";
import { TakeOnePanel } from "./TakeTable";

const noop = () => {};
const as = (role: Role, node: React.ReactNode) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{node}</MeProvider>
    </RoleProvider>,
  );
const row: TakeRow = { key: "k1|新規", keys: ["k1|新規"], kind: "新規", at: 600, timeKnown: true, patientId: PATIENTS[0].id, room: "512", name: PATIENTS[0].name, type: "注射", main: "KCl 20mEq", detail: "側管から", author: "山本（専攻医）", flags: { highRisk: "高リスク薬（カリウム注）" }, related: [], mustOne: ["高リスク薬（カリウム注）"] };

describe("確かめたのチェック", () => {
  it("the label is the target: at least 32px high and coloured when ticked", () => {
    const off = renderToStaticMarkup(<ConfirmCheck checked={false} onChange={noop}>確かめた</ConfirmCheck>);
    expect(off).toMatch(/<label class="flex min-h-8 cursor-pointer [^"]*border-rule hover:bg-tab[^"]*"><input type="checkbox" class="h-4 w-4 shrink-0 accent-ai"\/><span>確かめた<\/span><\/label>/);
    const on = renderToStaticMarkup(<ConfirmCheck checked onChange={noop}>確かめた</ConfirmCheck>);
    expect(on).toContain("border-ai bg-ai-soft font-bold text-ai");
    expect(on).toContain('checked=""');
  });
  it("the ○ of an order block is a 32px label, coloured when ticked", () => {
    const html = renderToStaticMarkup(<BlockCheck checked label="佐倉 修 入院注射 をチェック" onChange={noop} />);
    expect(html).toMatch(/<label class="flex h-8 w-8 items-center justify-center rounded cursor-pointer hover:bg-tab bg-ai-soft"><input type="checkbox" aria-label="佐倉 修 入院注射 をチェック"/);
    const block = renderToStaticMarkup(<SheetBlock check={{ checked: false, label: "x をチェック", onChange: noop }} title="入院注射" when="11/4（水） 10:00" stamps={{ start: { at: "", by: "" }, done: { at: "", by: "" }, take: { at: "", by: "" } }} fields={[]} />);
    expect(block).toContain('<label class="flex h-8 w-8 items-center justify-center rounded cursor-pointer hover:bg-tab "><input type="checkbox" aria-label="x をチェック"');
  });
  it("the ward's 1件ずつ受ける: 受ける is plainly disabled with the words beside it until the check (and the second nurse of a high-risk drug)", () => {
    const html = as("看護師", <TakeOnePanel row={row} nurses={["看護師 佐藤", "看護師 田中"]} onTake={noop} onClose={noop} />);
    expect(html).toContain("flex min-h-8 cursor-pointer");
    expect(html).toContain(`<button type="button" disabled="" class="${WAITING_BUTTON}">この指示を受ける</button><span class="text-[11px] font-bold text-yamabuki">${CHECK_FIRST}</span>`);
    expect(WAITING_BUTTON).toContain("disabled:bg-rule disabled:text-ink-faint");
    expect(html).not.toContain("2人目の確認者を選ぶと受けられます"); // the check comes first
  });
  it("the radiology's 指示確認: 確認した waits for the check and says so", () => {
    const orders = demoRisOrders(600);
    const people = PATIENTS.map((p) => ({ patient: p, room: p.room, entries: (orders[p.id] ?? []) as OrderEntry[] }));
    const ct = risRows(people, initialRisDesk(600)).find((r) => r.orderId === "o-ris-demo2")!;
    const mori = PATIENTS.find((p) => p.id === ct.patientId)!;
    const html = as("診療放射線技師", <RisConfirmPanel r={ct} items={risConfirmItems(ct, mori, orders[mori.id], undefined, { y: 2026, m: 11, d: 4 })} onConfirm={noop} onClose={noop} />);
    expect(html).toContain("同意・腎機能・アレルギー・内服を自分の目で確かめた</span></label>");
    expect(html).toContain(`<button type="button" disabled="" class="${WAITING_BUTTON}">確認した</button><span class="text-[11px] font-bold text-yamabuki">確かめたにチェックすると「確認した」を押せます</span>`);
    // A nurse cannot confirm: locked, without the words (the lock is explained elsewhere).
    const nurse = as("看護師", <RisConfirmPanel r={ct} items={[]} onConfirm={noop} onClose={noop} />);
    expect(nurse).not.toContain("確かめたにチェックすると");
  });
});
