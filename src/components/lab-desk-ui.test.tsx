// 検査室: the panic-value card says why 報告した cannot be pressed yet and keeps the report as one line; the
// 受付 table's 読む button stays on one line. Rendered on the server (without a browser).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EMPTY_DESK } from "@/lib/lab-desk";
import { PATIENTS } from "@/lib/patients";
import { currentEntries } from "@/lib/record";
import { PANIC_LIMITS, reportBlocker, reportCall, type PanicCall, type ResultItem } from "@/lib/results";
import { STAFF, type Role } from "@/lib/roles";
import type { OrderEntry } from "@/lib/types";
import type { WorkPatient } from "@/lib/worksheet";
import { LabView } from "./LabView";
import { PanicCard } from "./PanicCard";
import { MeProvider, RoleProvider } from "./RoleContext";

const as = (role: Role, node: React.ReactNode) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{node}</MeProvider>
    </RoleProvider>,
  );
const noop = () => {};
const sakura = PATIENTS[0];
const item: ResultItem = { key: "lab:x", patientId: sakura.id, kind: "検査", day: 0, time: "09:40", title: "血算・生化学", detail: "K 6.8", panic: [{ code: "LAB-K", name: "K", value: 6.8, unit: "mmol/L", side: "高", limit: 6.0 }] };
const card = (call?: PanicCall) => as("臨床検査技師", <PanicCard item={item} who={`512 ${sakura.name}さん`} name={sakura.name} when="今日 09:40" script={["K 6.8"]} call={call} tries={[]} nowTime="10:05" attending="山本（専攻医）" onCall={noop} onDesk={noop} />);

describe("パニック値の連絡の記録", () => {
  it("before the read-back is checked, the button is disabled and the reason stands beside it", () => {
    const html = card();
    expect(html).toContain("「相手が値を復唱した」にチェックするか、復唱できなかった理由を書くと記録できます");
    expect(html).toMatch(/<button type="button" disabled="" title="「相手が値を復唱した」にチェックするか[^"]*"[^>]*>.*報告した（10:05）/);
    expect(reportBlocker("主治医", false, "")).toContain("復唱");
    expect(reportBlocker("", true, "")).toBe("相手を入れると記録できます");
    expect(reportBlocker("主治医", true, "")).toBeNull();
    expect(reportBlocker("主治医", false, "処置中で電話が切れた")).toBeNull();
  });
  it("after the report, one line stays: 連絡 hh:mm 技師名 → 主治医", () => {
    const call = reportCall(item, [], { by: "検査技師 中村", to: "主治医 山本（専攻医）（オーダーした医師）", means: "電話", readBack: true, at: { day: 0, time: "10:05" } });
    const html = card(call);
    expect(html).toContain("連絡 10:05 検査技師 中村 → 主治医 山本（専攻医）（オーダーした医師）（電話・復唱あり）");
    expect(html).not.toContain("報告した（10:05）");
    expect(html).toContain("医師の対応の記録がまだです");
  });
});

describe("検体の受付の表", () => {
  it("the 読む button and its column do not wrap", () => {
    // A fictional draw tomorrow 06:00 (not taken yet): its row has the 読む button of the demo.
    const draw: OrderEntry = { kind: "order", id: "ord-ui-1", day: 0, time: "09:00", author: "山本（専攻医）", status: "有効", order: { type: "lab", codes: ["LAB-K"], collect: { day: 1, time: "06:00" }, priority: "定時" } };
    const people: WorkPatient[] = [{ patient: sakura, room: "512", entries: [...currentEntries(sakura, undefined).filter((e): e is OrderEntry => e.kind === "order"), draw] }];
    const html = as("臨床検査技師", <LabView people={people} items={[]} calls={{}} acks={{}} limits={PANIC_LIMITS} limitsSource="" nowTime="05:30" attending="山本（専攻医）" onCall={noop} records={{}} sessionStart={5 * 60} desk={EMPTY_DESK} onDesk={noop} />);
    expect(html).toContain('<th class="w-14 py-1 font-normal"></th>');
    expect(html).toMatch(/<td class="whitespace-nowrap py-1 text-right"><button type="button" class="whitespace-nowrap rounded[^"]*" title="デモ：この検体のラベルを読む">読む<\/button>/);
  });
});
