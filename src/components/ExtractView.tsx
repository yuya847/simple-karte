"use client";

import { Download, Search } from "lucide-react";
import { useState } from "react";
import { EXTRACT_COLUMNS, LAB_CHOICES, emptyQuery, toCsv, type ExtractQuery, type ExtractRow } from "@/lib/extract";
import { FLOORS } from "@/lib/ward";

/**
 * データ抽出: conditions across categories (病名 × 使用中の薬 × 検査値 × 年齢 × 病棟), the matching
 * patients as a table, and a CSV to save. Only this prototype's fictional patients are searched.
 */
export function ExtractView({ run, onExport }: { run: (q: ExtractQuery) => ExtractRow[]; onExport: (n: number) => void }) {
  const [q, setQ] = useState<ExtractQuery>(emptyQuery);
  const [rows, setRows] = useState<ExtractRow[] | null>(null);
  const set = (x: Partial<ExtractQuery>) => setQ((c) => ({ ...c, ...x }));
  const input = "rounded border border-rule bg-sheet px-2 py-1";
  const save = () => {
    if (!rows) return;
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `抽出_${rows.length}件.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onExport(rows.length);
  };
  return (
    <section aria-label="データ抽出" className="flex min-h-0 flex-1 flex-col bg-paper">
      <header className="border-b border-rule bg-sheet px-5 py-3">
        <h1 className="text-lg font-bold">
          データ抽出

        </h1>

      </header>
      <div className="grid gap-2 border-b border-rule bg-sheet px-5 py-3 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex items-center gap-2">
          病名
          <input value={q.diagnosis} onChange={(e) => set({ diagnosis: e.target.value })} placeholder="例：肺炎" className={`${input} flex-1`} />
        </label>
        <label className="flex items-center gap-2">
          使用中の薬
          <input value={q.drug} onChange={(e) => set({ drug: e.target.value })} placeholder="例：セフトリアキソン（カタカナはひらがなでも可）" className={`${input} flex-1`} />
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          検査値（最新）
          <select value={q.lab?.code ?? ""} onChange={(e) => set({ lab: e.target.value ? { code: e.target.value, op: q.lab?.op ?? "≥", value: q.lab?.value ?? 0 } : null })} aria-label="検査の項目" className={input}>
            <option value="">使わない</option>
            {LAB_CHOICES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          {q.lab && (
            <>
              <select value={q.lab.op} onChange={(e) => set({ lab: { ...q.lab!, op: e.target.value as "≥" | "≤" } })} aria-label="以上・以下" className={input}>
                <option value="≥">以上</option>
                <option value="≤">以下</option>
              </select>
              <input value={q.lab.value} onChange={(e) => set({ lab: { ...q.lab!, value: Number(e.target.value) || 0 } })} inputMode="decimal" aria-label="値" className={`${input} w-20 text-right`} />
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          年齢
          <input value={q.ageMin ?? ""} onChange={(e) => set({ ageMin: e.target.value ? Number(e.target.value) : null })} inputMode="numeric" aria-label="年齢の下限" className={`${input} w-16 text-right`} />
          〜
          <input value={q.ageMax ?? ""} onChange={(e) => set({ ageMax: e.target.value ? Number(e.target.value) : null })} inputMode="numeric" aria-label="年齢の上限" className={`${input} w-16 text-right`} />
          歳
        </div>
        <label className="flex items-center gap-2">
          病棟
          <select value={q.ward} onChange={(e) => set({ ward: e.target.value })} className={input}>
            <option value="">すべて</option>
            {FLOORS.map((f) => (
              <option key={f.name} value={f.name.replace("病棟", "")}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setRows(run(q))} className="flex items-center gap-1.5 rounded-md bg-ai px-4 py-1.5 font-bold text-white">
            <Search size={14} />
            探す
          </button>
          <button
            type="button"
            onClick={() => {
              setQ(emptyQuery());
              setRows(null);
            }}
            className="rounded-md border border-rule px-3 py-1.5 text-ink-soft"
          >
            条件を消す
          </button>
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto px-5 py-3">
        {rows === null ? (
          <p className="text-[13px] text-ink-faint">条件を入れて「探す」を押してください。</p>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-3">
              <b className="nums">{rows.length}件</b>
              <button type="button" disabled={!rows.length} onClick={save} className="flex items-center gap-1.5 rounded-md border border-ai px-3 py-1 text-[13px] font-bold text-ai hover:bg-ai-soft disabled:opacity-40">
                <Download size={14} />
                CSV で保存
              </button>
              <span className="text-[11px] text-ink-faint">CSV は Excel でそのまま開けます（UTF-8・BOM 付き）。保存したことは監査ログに残ります。</span>
            </div>
            <table className="nums w-full border-collapse text-[12px]">
              <thead className="text-left text-[11px] text-ink-faint">
                <tr>
                  {EXTRACT_COLUMNS.map((c) => (
                    <th key={c.key} className="border-b border-rule px-2 py-1 font-normal">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-rule-soft bg-sheet align-top">
                    {EXTRACT_COLUMNS.map((c) => (
                      <td key={c.key} className="px-2 py-1">
                        {r[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  );
}

/* Help migration source (references and dynamic wording):
<p >条件をかけ合わせて患者を探し、表で見て CSV で保存します（例：肺炎で、抗菌薬を使っていて、CRP 10 以上）。空の条件は使いません。</p>
*/
