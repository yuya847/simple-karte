"use client";

import { useState } from "react";

/** Two values in, written to .env.local and (if chosen) to Vercel's production environment. */
export function SetupForm({ defaultUrl }: { defaultUrl: string }) {
  const [url, setUrl] = useState(defaultUrl);
  const [key, setKey] = useState("");
  const [vercel, setVercel] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const send = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/dev/supabase-env", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, key, vercel }) });
      const json = await res.json();
      if (!res.ok) setResult({ ok: false, lines: [json.error ?? `エラー（${res.status}）`] });
      else {
        setResult({ ok: true, lines: [json.envLocal, ...Object.entries(json.vercel as Record<string, string>).map(([k, v]) => `Vercel ${k}：${v}`)] });
        setKey("");
      }
    } catch {
      setResult({ ok: false, lines: ["送れませんでした。開発用のサーバー（npm run dev）で開いていますか？"] });
    } finally {
      setBusy(false);
    }
  };
  const field = "w-full rounded border border-rule bg-paper px-2 py-1.5 font-mono text-[13px] outline-none focus:border-ai";
  return (
    <main className="mx-auto max-w-xl space-y-4 p-8 text-[14px] text-ink">
      <h1 className="text-lg font-bold">記録の保存先（Supabase）の設定</h1>
      <p className="text-[13px] text-ink-soft">手元の開発用の画面です。入れた値は、このパソコンの .env.local と、選べば Vercel の本番の環境変数に入ります。画面にもログにも残しません。</p>
      <label className="block space-y-1">
        <span className="font-bold">Project URL</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} className={field} spellCheck={false} />
      </label>
      <label className="block space-y-1">
        <span className="font-bold">Publishable key</span>
        <input value={key} onChange={(e) => setKey(e.target.value)} type="password" autoComplete="off" placeholder="sb_publishable_…" className={field} spellCheck={false} />
        <span className="block text-[12px] text-ink-soft">Supabase の Settings → API Keys の「Publishable key」。secret キー（sb_secret_…）は入れないでください。</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={vercel} onChange={(e) => setVercel(e.target.checked)} className="accent-ai" />
        Vercel の本番（production）の環境変数にも入れる（手元の vercel コマンドを使う）
      </label>
      <button type="button" disabled={busy || !url.trim() || !key.trim()} onClick={send} className="rounded-md bg-ai px-4 py-2 font-bold text-white disabled:opacity-40">
        {busy ? "入れています…" : "入れる"}
      </button>
      {result && (
        <ul className={`space-y-0.5 text-[13px] ${result.ok ? "text-wakatake" : "text-shu"}`}>
          {result.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      <p className="text-[12px] text-ink-faint">入れたあと：手元は開発用のサーバーを立ち上げ直すと読み込みます。本番は次のデプロイ（main への push か Vercel の Redeploy）から使われます。</p>
    </main>
  );
}
