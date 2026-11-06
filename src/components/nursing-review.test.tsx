import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Worksheet } from "./Worksheet";
import { HandoffView } from "./HandoffView";
import { VitalsPanel } from "./panels/VitalsPanel";
import { ToolRail } from "./ToolRail";
import { RoleProvider, MeProvider } from "./RoleContext";
import { SCENARIOS } from "@/lib/scenarios";
import { STAFF } from "@/lib/roles";
import { handoffKey, type Handoff } from "@/lib/handoff";
import { helpSections } from "@/lib/help";

const noop = () => {};
const today = { y: 2026, m: 11, d: 6 };
const patient = SCENARIOS.patients.find((p) => p.ward === "5階南病棟")!;
const people = [{ patient, room: `${patient.room}A`, entries: [] }];
const nurse = (children: React.ReactNode) => <RoleProvider value="看護師"><MeProvider value={STAFF.看護師}>{children}</MeProvider></RoleProvider>;
it("業務分担が未定ならオーダ件数によらず病棟の人数と病棟名を出す", () => {
  const html = renderToStaticMarkup(nurse(<Worksheet people={people} today={today} nowTime="17:30" taken={{}} sessionKeys={new Set()} onTake={noop} records={{}} sessionStart={990} onRecord={noop} assigned={() => []} />));
  expect(html).toContain("5階南病棟 ワークシート");
  expect(html).toContain("病棟 1人");
  expect(html).not.toContain("受け持ち 0人");
  expect(html).toContain("夜勤 16:30");
});
it("夜勤の始まりは日勤から届いた申し送りと復唱が先に出る", () => {
  const h: Handoff = { id: "handoff", patientId: patient.id, shift: "日勤→夜勤", shiftLo: 990, role: "看護師", severity: "安定", summary: "日中の食事摂取を確認した", actions: [{ text: "夕食後の観察" }], contingency: "変化があれば医師へ報告", facts: [], from: "看護師 田中", sentAt: { day: 0, time: "16:30" } };
  const html = renderToStaticMarkup(nurse(<HandoffView people={people} today={today} nowTime="17:30" handoffs={{ [handoffKey(patient.id, 990, "看護師")]: h }} onSave={noop} onSend={noop} onReceive={noop} />));
  expect(html).toContain("日勤から受ける");
  expect(html).toContain("日中の食事摂取を確認した");
  expect(html).toContain("復唱して受けた");
  expect(html.indexOf("受けた人の復唱")).toBeLessThan(html.indexOf("カルテから"));
  expect(html).not.toContain("ブラウザの中だけ");
  expect(html).not.toContain("送る人が選びます");
  expect(html).not.toContain("申し送りの口述");
});
it("バイタルの酸素は方法を選び、看護師の右端は看護から開く", () => {
  const vital = renderToStaticMarkup(nurse(<VitalsPanel nowTime="17:30" onSave={noop} />));
  for (const name of ["室内気", "鼻カニュラ", "マスク", "リザーバー", "ハイフロー"]) expect(vital).toContain(`<option value="${name}"`);
  const rail = renderToStaticMarkup(nurse(<ToolRail open={null} onOpen={noop} />));
  expect(rail).toMatch(/aria-selected="true"[^>]*>[^]*?看護/);
});
it("転倒の出典と院内ルールはヘルプで読める", () => {
  const help = helpSections.find((s) => s.id === "screen:falls");
  expect(help?.bullets.join(" ")).toContain("提言7");
});
