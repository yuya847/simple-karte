"use client";

import { Printer } from "lucide-react";
import { useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { DrugLabel, PatientLabel, SpecimenLabel, Wristband, type DrugItem, type LabelPatient, type SpecimenItem } from "../Labels";
import { TabChoice } from "../TabChoice";

type Kind = "patient" | "wrist" | "specimen" | "drug";

/**
 * ラベルの発行: 患者ラベル, リストバンド, 検体ラベル (each draw) and 薬剤ラベル (each dose). The code on a
 * specimen or drug label is the one the ward's 照合 expects for that dose, so reading it at the bedside
 * matches. Choose, look, print.
 */
export function LabelsPanel({ p, specimens, drugs, onPrint }: { p: LabelPatient; specimens: SpecimenItem[]; drugs: DrugItem[]; onPrint: (what: string, n: number) => void }) {
  const [kind, setKind] = useState<Kind>("patient");
  const [copies, setCopies] = useState(6);
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [printing, setPrinting] = useState<React.ReactNode | null>(null);
  const list = kind === "specimen" ? specimens : kind === "drug" ? drugs : [];
  const chosen = list.filter((x) => pick[x.code] ?? true);
  const sheet =
    kind === "patient" ? (
      Array.from({ length: copies }, (_, i) => <PatientLabel key={i} p={p} />)
    ) : kind === "wrist" ? (
      <Wristband p={p} />
    ) : kind === "specimen" ? (
      (chosen as SpecimenItem[]).map((s) => <SpecimenLabel key={s.code} p={p} s={s} />)
    ) : (
      (chosen as DrugItem[]).map((d) => <DrugLabel key={d.code} p={p} d={d} />)
    );
  const count = kind === "patient" ? copies : kind === "wrist" ? 1 : chosen.length;
  const label = { patient: "患者ラベル", wrist: "リストバンド", specimen: "検体ラベル", drug: "薬剤ラベル" }[kind];
  const print = () => {
    flushSync(() => setPrinting(<div className="flex flex-wrap content-start gap-[3mm]">{sheet}</div>));
    const done = () => {
      setPrinting(null);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    onPrint(label, count);
  };
  return (
    <div className="space-y-3 text-[12px]">
      <TabChoice
        label="ラベルの種類"
        options={[
          { value: "patient", label: "患者ラベル" },
          { value: "wrist", label: "リストバンド" },
          { value: "specimen", label: `検体ラベル（${specimens.length}）` },
          { value: "drug", label: `薬剤ラベル（${drugs.length}）` },
        ]}
        value={kind}
        onChange={(v) => setKind(v as Kind)}
      />
      {kind === "patient" && (
        <div className="flex items-center gap-1.5">
          枚数
          <TabChoice label="患者ラベルの枚数" options={[1, 3, 6, 12].map((n) => ({ value: n, label: `${n}枚` }))} value={copies} onChange={setCopies} />
        </div>
      )}
      {list.length > 0 && (
        <ul className="space-y-0.5">
          {list.map((x) => (
            <li key={x.code}>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={pick[x.code] ?? true} onChange={() => setPick((m) => ({ ...m, [x.code]: !(m[x.code] ?? true) }))} className="accent-ai" />
                <span className="nums">{x.when}</span>
                <span className="min-w-0 truncate">{"tests" in x ? x.tests : x.main}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {(kind === "specimen" || kind === "drug") && list.length === 0 && <p className="text-ink-faint">今日と明日の{kind === "specimen" ? "採血" : "注射"}はありません。</p>}
      <div className="flex items-center gap-2">
        <button type="button" disabled={!count} onClick={print} className="flex items-center gap-1.5 rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40">
          <Printer size={14} />
          {label}を印刷（{count}枚）
        </button>
        <span className="text-[11px] text-ink-faint">ラベルプリンタがない場合は、ふつうのプリンタで切って使えます。</span>
      </div>
      <div className="flex flex-wrap gap-2 overflow-x-auto rounded-md border border-rule bg-paper p-2">{sheet}</div>
      <p className="text-[11px] text-ink-faint">検体・薬剤ラベルのバーコードは、ワークシートの「照合」で読む番号と同じです（オーダと回ごとに1つ）。リストバンドと患者ラベルは ID です。</p>
      {printing && typeof document !== "undefined" && createPortal(<div className="hidden bg-white p-[5mm] print:block">{printing}</div>, document.body)}
    </div>
  );
}
