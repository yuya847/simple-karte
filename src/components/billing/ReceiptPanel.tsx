"use client";

import { AlertTriangle, CheckCircle2, Download, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import type { ReceiptSheetData } from "@/lib/billing/receipt-sheet";
import { ReceiptSheet } from "./ReceiptSheet";
import { usePrintSheet } from "../DeskParts";
import { auditLog } from "@/lib/audit";
import { useMe } from "../RoleContext";
import type { PatientMonthPayload } from "@/lib/billing/payload";

interface UkeResult {
  payer: "1" | "2";
  label: string;
  filename: string;
  count: number;
  totalPoints: number;
  problems: string[];
  text: string;
  base64: string;
}

const RECORD_NAME: Record<string, string> = {
  IR: "医療機関",
  RE: "レセプト共通",
  HO: "保険者",
  SN: "資格確認",
  JD: "受診日等",
  MF: "窓口負担額",
  SY: "傷病名",
  SI: "診療行為",
  IY: "医薬品",
  TO: "特定器材",
  CO: "コメント",
  GO: "請求書",
};

/** This patient's receipt records, and the ward's receipt files for the month. */
export function ReceiptPanel({
  lines,
  data,
  month,
  today,
  nowTime,
  wardPayload,
  selfPay = false,
}: {
  selfPay?: boolean;
  lines: string[];
  data: ReceiptSheetData | null;
  month: string;
  today: string;
  nowTime: string;
  wardPayload: () => PatientMonthPayload[];
}) {
  const me = useMe();
  const [records, setRecords] = useState(false);
  const [print, printSheet] = usePrintSheet();
  const [files, setFiles] = useState<UkeResult[] | null>(null);
  const [inspection, setInspection] = useState<{unresolved: number; target: {wards: string[]; total: number; included: number; excluded: number}} | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = Number(month.slice(5));

  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/receipt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ today, nowTime, month, patients: wardPayload() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `エラー（${res.status}）`);
      setFiles(json.files as UkeResult[]);
      setInspection(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "レセプトを作れませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const download = (f: UkeResult) => {
    const bin = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bin], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = f.filename;
    a.click();
    auditLog({ role: me.role, actor: me.name, action: "レセプトのファイルを書き出した", detail: f.filename });
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-4">
      {printSheet}
      <section aria-label="この患者のレセプト">
        <div className="mb-2 flex gap-2 text-xs">
          <button type="button" aria-pressed={records} onClick={() => setRecords(!records)} className="rounded border border-rule px-3 py-1.5">{records ? "明細書を見る" : "記録（UKE）を見る"}</button>
          <button type="button" disabled={!data || selfPay} onClick={() => data && print(<ReceiptSheet data={data} />, { portrait: true })} className="rounded border border-rule px-3 py-1.5 disabled:opacity-40">印刷（A4 縦）</button>
        </div>
        {selfPay && <p className="text-xs">自費のため、保険請求のレセプトは作りません。金額は「会計」で確認できます。</p>}
        {!selfPay && !records && data && <div className="overflow-x-auto rounded border border-rule"><div className="min-w-[900px] print:min-w-0"><ReceiptSheet data={data} /></div></div>}
        {!selfPay && records && <>
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold">
          <FileText size={14} />
          この患者の{m}月分のレコード（記録条件仕様・医科{data?.dpc ? "・出来高" : ""}）
        </h3>

        <div className="scroll-thin max-h-[46vh] overflow-auto rounded-md border border-rule bg-paper p-2">
          <table className="w-full border-collapse font-mono text-[11px] leading-snug">
            <tbody>
              {lines.map((l, i) => {
                const kind = l.slice(0, 2);
                return (
                  <tr key={i} className="align-top">
                    <td className="w-20 whitespace-nowrap pr-2 text-ink-faint">{RECORD_NAME[kind] ?? kind}</td>
                    <td className="break-all text-ink">{l.replace(/,+$/, (tail) => (tail.length > 3 ? `,…（空き${tail.length}）` : tail))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>}
      </section>

      <section aria-label="病棟のレセプトファイル" className="rounded-md border border-rule bg-sheet p-3">
        {data?.dpc && <p className="mb-2 text-xs text-ink-soft">DPC は明細書の表示・印刷に対応しています。UKE ファイルは出来高の点数で出力します。</p>}
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-bold">{m}月分のレセプトファイル（選択中の病棟）</h3>
          <button
            type="button"
            onClick={build}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-ai px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            作って点検する
          </button>
          <span className="text-[11px] text-ink-faint">社保と、国保・後期は別のファイル（RECEIPTC.UKE、シフトJIS）になります。</span>
        </div>
        {error && <p className="mt-2 text-sm text-shu">{error}</p>}
        {inspection && <p className="mt-2 text-xs">{inspection.target.wards.join("・")}：対象 {inspection.target.included}人・除外 {inspection.target.excluded}人（入院日なし・自費）／請求内容の未解決 {inspection.unresolved}件</p>}
        {files && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {files.map((f) => (
              <div key={f.payer} className="rounded-md border border-rule bg-paper p-3 text-xs">
                <div className="mb-1 font-bold">{f.label}</div>
                <div className="nums mb-2 text-ink-soft">
                  {f.count}件・総合計 {f.totalPoints.toLocaleString("ja-JP")}点
                </div>
                {f.problems.length === 0 ? (
                  <p className="mb-2 flex items-center gap-1 text-wakatake">
                    <CheckCircle2 size={13} />
                    ファイル形式：問題なし
                  </p>
                ) : (
                  <ul className="mb-2 space-y-0.5">
                    {f.problems.map((p) => (
                      <li key={p} className="flex items-start gap-1 text-yamabuki">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                        <span className="text-ink">{p}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => download(f)}
                  disabled={f.count === 0}
                  className="flex items-center gap-1 rounded border border-rule bg-sheet px-2 py-1 hover:bg-tab disabled:opacity-40"
                >
                  <Download size={12} />
                  {f.filename} を保存
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-ink-faint">実際の請求には使えません。</p>
      </section>
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >点数は「点数・回数算定単位」の最後のレコードだけに入ります。右の31個の欄は1日〜31日の回数です。</p>
*/
