/** 画面からの接続口（fs・engineの値importなし）。
 * 1. workspaceのshoki/tekiyoAnswersをkisaiWorkspaceで読む。
 * 2. サーバーがloadTekiyoMaster()で読んだ公開マスターを渡す。
 * 3. 結果.claimと結果.shokiをReceiptに渡し、buildUkeを呼ぶ。
 * 点検結果を算定の可否に読み替えない。未照合項目の要件を「不要」と表示しない。
 */
import { checkKisai, type KisaiChart } from "./kisai";
import { kisaiWorkspace, type KisaiWorkspace } from "./kisai-workspace";
import type { ClaimResult } from "./model";
import { currentShoki, requiredShoki } from "./shoki";
import { applyTekiyo, resolveTekiyo, type TekiyoMaster } from "./tekiyo";

export function prepareBillingDocumentation(claim: ClaimResult, chart: KisaiChart, master: TekiyoMaster[], saved?: Partial<KisaiWorkspace> | null) {
  const workspace = kisaiWorkspace(saved);
  const tekiyo = resolveTekiyo(claim, { patientId: chart.patientId, today: chart.today, entries: chart.entries ?? [], master, answers: workspace.tekiyoAnswers });
  const checks = checkKisai(claim, chart);
  const checkedCodes = new Set(checks.flatMap(c => c.codes));
  const tekiyoCodes = new Set(tekiyo.map(t => t.claimCode));
  const lines = [...new Map(claim.acts.flatMap(a => a.parts.flatMap(p => p.lines)).filter(l => l.record === "SI").map(l => [l.code, l])).values()];
  return {
    claim: applyTekiyo(claim, tekiyo),
    /** 系列ごとに確定した最新の版（前の版・下書きは保存に残り、レセプトには出さない）。 */
    shoki: currentShoki(workspace.shoki.filter(s => s.patientId === chart.patientId && s.month === claim.month)),
    requiredShoki: requiredShoki(claim),
    checks,
    tekiyo,
    /** 未照合であり、「記載不要」ではない。対応範囲を画面が隠して完了表示しないための出力。 */
    unverified: {
      kisai: lines.filter(l => !checkedCodes.has(l.code)),
      tekiyo: lines.filter(l => !tekiyoCodes.has(l.code)),
    },
  };
}
