import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { demoRisOrders, initialRisDesk } from "@/lib/ris";
import { HistoryPane } from "./HistoryPane";
import { ReportContext } from "./ReportMark";

it("カルテの画像検査はRISの撮影・読影状態を表示し、画像送信までリンクを出さない", () => {
  const patient = PATIENTS.find((p) => p.id === "90010198")!;
  const entries = demoRisOrders(600)[patient.id];
  const desk = initialRisDesk(600);
  const render = (ris: typeof desk) => renderToStaticMarkup(<ReportContext.Provider value={{ ris, reports: [], acks: {}, today: { y: 2026, m: 11, d: 6 } }}><HistoryPane patient={patient} entries={entries} today={{ y: 2026, m: 11, d: 6 }} selectedDay={null} showStopped={false} onToggleStopped={() => {}} onOpenImage={() => {}} /></ReportContext.Provider>);
  const html = render(desk);
  expect(html).toContain("読影済");
  expect(html).toContain("画像を開く（PACS）");
  const withoutImages = Object.fromEntries(Object.entries(desk).map(([id, w]) => [id, { ...w, images: undefined, report: undefined }]));
  const pending = render(withoutImages);
  expect(pending).toContain("撮影済");
  expect(pending).not.toContain("画像を開く（PACS）");
});
