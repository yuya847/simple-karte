"use client";

// 患者さん用の QR: the 診察券 (外来の受付) and the bedside (カルテ) show and print a QR of the patient's page. The
// server makes the token (the workspace and the patient, encrypted); the printed card has no birth date.

import { ExternalLink, Printer, QrCode, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { qrMatrix, qrPath } from "@/lib/portal/qr";

function QrSvg({ text, size }: { text: string; size: number }) {
  const p = qrPath(qrMatrix(text));
  return (
    <svg role="img" aria-label="QR コード" width={size} height={size} viewBox={`0 0 ${p.size} ${p.size}`} shapeRendering="crispEdges" className="bg-white">
      <rect width={p.size} height={p.size} fill="#fff" />
      <path d={p.d} fill="#000" />
    </svg>
  );
}

function Card({ url, name, kana, label }: { url: string; name: string; kana?: string; label?: string }) {
  return (
    <div className="w-[86mm] rounded-lg border border-ink bg-white p-[4mm] text-ink">
      <div className="flex items-baseline justify-between text-[9pt]">
        <span>架空総合病院</span>
        {label && <span className="nums">{label}</span>}
      </div>
      <div className="mt-1 flex items-center gap-[4mm]">
        <QrSvg text={url} size={140} />
        <div className="min-w-0 space-y-1">
          {kana && <div className="text-[8pt]">{kana}</div>}
          <div className="text-[14pt] font-bold">{name} 様</div>
          <div className="text-[8pt] leading-snug">読み取って、生年月日を入れて開きます</div>
        </div>
      </div>
    </div>
  );
}

export function PortalQr({ ws, subject, name, kana, birth, label }: { ws: string | null; subject: string; name: string; kana?: string; birth: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const show = async () => {
    setOpen(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ws, subject }) });
      const json = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !json.token) throw new Error(json.error ?? "作れませんでした。");
      setUrl(`${window.location.origin}/patient#t=${json.token}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "作れませんでした。");
    }
  };
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [open]);
  const print = () => {
    flushSync(() => setPrinting(true));
    const done = () => {
      setPrinting(false);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };
  return (
    <>
      <button type="button" onClick={() => void show()} className="flex items-center gap-1.5 rounded-md border border-rule px-3 py-1.5 text-sm hover:border-ai hover:text-ai">
        <QrCode size={14} />
        患者さん用の QR
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/30 p-4 print:hidden" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="患者さん用の QR" className="w-full max-w-md space-y-3 rounded-xl border border-rule bg-sheet p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <b className="flex-1">患者さん用の QR</b>
              <button type="button" aria-label="閉じる" onClick={() => setOpen(false)} className="rounded p-1 text-ink-soft hover:text-ink">
                <X size={16} />
              </button>
            </div>
            {error ? <p className="text-sm text-shu">{error}</p> : url ? <Card url={url} name={name} kana={kana} label={label} /> : <p className="text-sm text-ink-faint">作成中…</p>}
            <div className="nums text-sm text-ink-soft">生年月日 {birth}</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!url} onClick={print} className="flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40">
                <Printer size={14} />
                印刷
              </button>
              {url && (
                <a href={url} target="_blank" rel="noreferrer" data-portal-url={url} className="flex items-center gap-1.5 rounded-md border border-rule px-3 py-1.5 text-sm hover:border-ai hover:text-ai">
                  <ExternalLink size={14} />
                  この端末で開く
                </a>
              )}
            </div>
          </div>
        </div>
      )}
      {printing && url && typeof document !== "undefined" && createPortal(<div className="hidden bg-white p-[10mm] print:block"><Card url={url} name={name} kana={kana} label={label} /></div>, document.body)}
    </>
  );
}
