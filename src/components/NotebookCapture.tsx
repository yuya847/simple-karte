"use client";

import { Camera, Check, ImagePlus, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { boxFrom, boxPixels, jpegData, photoFileProblem, PHOTO_LIMITS, SAMPLE_PAGES, SEND_QUALITIES, sendProblem, sendSize, type Box, type KeptPage } from "@/lib/notebook-photo";
import type { BroughtRow } from "@/lib/pharmacy";
import { loadImage, shrink } from "./panels/ScanPanel";

export type ReadRow = Omit<BroughtRow, "match" | "checked" | "decision">;
export type { KeptPage };
export interface PhotoRead {
  rows: ReadRow[];
  notRead: { text: string; reason: string }[];
  pages: KeptPage[];
}

interface Page {
  id: number;
  url: string;
  /** An object URL of a file taken in (freed when the page goes). */
  own: boolean;
  box: Box | null;
  name: string;
  bytes: number;
  sample?: boolean;
}

/**
 * お薬手帳を撮る: photos of the notebook (camera on a phone or tablet, files or a drag on a computer, or the
 * fictional sample), one or more pages. On each page the user boxes the drug lines; nothing is boxed at
 * first and nothing is sent until every page is boxed. Only the boxed parts go to /api/mochikomi (made
 * smaller, JPEG); the whole photos come back to the caller to keep in the patient's 文書.
 */
export function NotebookCapture({ onRead, disabled = false }: { onRead: (r: PhotoRead) => void; disabled?: boolean }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState<"" | "load" | "read">("");
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const nextId = useRef(1);
  const owned = useRef<string[]>([]);
  useEffect(() => {
    const list = owned.current;
    return () => list.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const tooMany = `一度に読み取れるのは${PHOTO_LIMITS.pages}ページまでです。`;
  // The new page is shown (the index is kept inside the pages when drawn).
  const push = (p: Omit<Page, "id" | "box">) => {
    const id = nextId.current++;
    setPages((ps) => [...ps, { ...p, id, box: null }]);
    setCurrent(Number.MAX_SAFE_INTEGER);
  };
  const add = async (files: File[]) => {
    setError(null);
    setBusy("load");
    let room = PHOTO_LIMITS.pages - pages.length;
    try {
      for (const f of files) {
        const why = room <= 0 ? tooMany : photoFileProblem(f);
        if (why) {
          setError(why);
          continue;
        }
        room--;
        const url = URL.createObjectURL(f);
        try {
          await loadImage(url);
          owned.current.push(url);
          push({ url, own: true, name: f.name.slice(0, 120), bytes: f.size });
        } catch (e) {
          URL.revokeObjectURL(url);
          setError(e instanceof Error ? e.message : "画像を読めませんでした。");
        }
      }
    } finally {
      setBusy("");
    }
  };
  const addSample = () => {
    setError(null);
    if (pages.length >= PHOTO_LIMITS.pages) return setError(tooMany);
    const src = SAMPLE_PAGES.find((s) => !pages.some((p) => p.url === s)) ?? SAMPLE_PAGES[0];
    push({ url: src, own: false, name: `見本（お薬手帳 ${SAMPLE_PAGES.indexOf(src as (typeof SAMPLE_PAGES)[number]) + 1}）.jpg`, bytes: 0, sample: true });
  };
  const remove = (id: number) => {
    const p = pages.find((x) => x.id === id);
    if (p?.own) URL.revokeObjectURL(p.url);
    setPages((ps) => ps.filter((x) => x.id !== id));
    setCurrent((c) => Math.max(0, Math.min(c, pages.length - 2)));
  };
  const setBox = (id: number, box: Box) => setPages((ps) => ps.map((x) => (x.id === id ? { ...x, box } : x)));

  const read = async () => {
    setError(null);
    setBusy("read");
    try {
      const images: string[] = [];
      const kept: KeptPage[] = [];
      for (const p of pages) {
        const img = await loadImage(p.url);
        const px = p.box && boxPixels(p.box, { w: img.naturalWidth, h: img.naturalHeight });
        if (!px) throw new Error("囲んだ範囲が小さすぎます。薬の行を囲み直してください。");
        const size = sendSize(px.w, px.h);
        const c = document.createElement("canvas");
        c.width = size.w;
        c.height = size.h;
        const g = c.getContext("2d");
        if (!g) throw new Error("画像を切り出せませんでした。");
        g.fillStyle = "#fff";
        g.fillRect(0, 0, size.w, size.h);
        g.drawImage(img, px.x, px.y, px.w, px.h, 0, 0, size.w, size.h);
        let data = "";
        for (const q of SEND_QUALITIES) {
          data = jpegData(c.toDataURL("image/jpeg", q));
          if (data.length <= PHOTO_LIMITS.perImage) break;
        }
        images.push(data);
        const whole = await shrink(p.url);
        kept.push({ dataUrl: whole.dataUrl, width: whole.width, height: whole.height, name: p.name, bytes: p.bytes || whole.dataUrl.length, ...(p.sample ? { sample: true } : {}) });
      }
      const why = sendProblem(images);
      if (why) throw new Error(why);
      const res = await fetch("/api/mochikomi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images }) });
      const json = (await res.json().catch(() => ({}))) as { rows?: ReadRow[]; notRead?: PhotoRead["notRead"]; error?: string };
      if (!res.ok || !json.rows) throw new Error(json.error ?? "読み取れませんでした。");
      onRead({ rows: json.rows, notRead: json.notRead ?? [], pages: kept });
      pages.forEach((p) => p.own && URL.revokeObjectURL(p.url));
      setPages([]);
      setCurrent(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み取れませんでした。");
    } finally {
      setBusy("");
    }
  };

  const shownAt = Math.min(current, pages.length - 1);
  const page = pages[shownAt];
  const ready = pages.length > 0 && pages.every((p) => p.box);
  const off = disabled || busy !== "";
  const pick = (capture: boolean) => (
    <input
      type="file"
      accept={capture ? "image/*" : "image/*,application/pdf"}
      {...(capture ? { capture: "environment" as const } : { multiple: true })}
      className="sr-only"
      disabled={off}
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = "";
        if (files.length) void add(files);
      }}
    />
  );
  const button = "flex cursor-pointer items-center gap-1 rounded-md border border-rule bg-sheet px-2.5 py-1 hover:border-ai hover:text-ai pointer-coarse:py-2";

  return (
    <div
      data-notebook-capture
      onDragOver={(e) => {
        if (off || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (off || !e.dataTransfer.files.length) return;
        e.preventDefault();
        setOver(false);
        void add([...e.dataTransfer.files]);
      }}
      className={`space-y-2 rounded-md border border-dashed p-2 ${over ? "border-ai bg-ai-soft/50" : "border-rule"}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <label className={`${button} hidden pointer-coarse:flex ${off ? "pointer-events-none opacity-40" : ""}`}>
          <Camera size={14} />
          お薬手帳を撮る
          {pick(true)}
        </label>
        <label className={`${button} ${off ? "pointer-events-none opacity-40" : ""}`}>
          <ImagePlus size={14} />
          <span className="pointer-coarse:hidden">お薬手帳の画像を選ぶ</span>
          <span className="hidden pointer-coarse:inline">画像を選ぶ</span>
          {pick(false)}
        </label>
        <button type="button" disabled={off} onClick={addSample} className={`${button} border-dashed text-ink-soft disabled:opacity-40`}>
          <Sparkles size={14} />
          見本で試す
        </button>
        {pages.length > 0 && (
          <div role="tablist" aria-label="ページ" className="flex flex-wrap items-center gap-1">
            {pages.map((p, i) => (
              <button key={p.id} type="button" role="tab" aria-selected={i === shownAt} onClick={() => setCurrent(i)} className={`nums flex items-center gap-0.5 rounded px-2 py-0.5 ${i === shownAt ? "bg-ink font-bold text-white" : "border border-rule text-ink-soft"}`}>
                {i + 1}
                {p.box && <Check size={12} aria-label="囲み済み" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {page && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            {!page.box && <b className="text-ai">薬の行を囲んでください</b>}
            {page.sample && <span className="rounded border border-dashed border-ink-faint px-1 text-[10px] text-ink-soft">見本</span>}
            <button type="button" onClick={() => remove(page.id)} disabled={off} className="ml-auto flex items-center gap-0.5 text-ink-soft hover:text-shu disabled:opacity-40">
              <X size={13} />
              このページを外す
            </button>
          </div>
          <Cropper key={page.id} src={page.url} box={page.box} onBox={(b) => setBox(page.id, b)} disabled={off} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!ready || off} onClick={() => void read()} className="rounded bg-ai px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-40">
              {busy === "read" ? "読み取り中…" : `表にする（${pages.length}ページ）`}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-[12px] text-shu">{error}</p>}
    </div>
  );
}

/** The photo with the box drawn on it (drag with a mouse, a finger or a pen; drag again to box anew). Outside the box is dimmed. */
function Cropper({ src, box, onBox, disabled }: { src: string; box: Box | null; onBox: (b: Box) => void; disabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const at = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const shown = drag ? boxFrom(drag.a, drag.b) : box;
  return (
    <div className="overflow-hidden rounded border border-rule-soft bg-paper">
      <div
        ref={ref}
        data-cropper
        className={`relative mx-auto w-fit max-w-full select-none ${disabled ? "" : "cursor-crosshair touch-none"}`}
        onPointerDown={(e) => {
          if (disabled || e.button > 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = at(e);
          setDrag({ a: p, b: p });
        }}
        onPointerMove={(e) => drag && setDrag({ ...drag, b: at(e) })}
        onPointerUp={(e) => {
          if (!drag) return;
          const b = boxFrom(drag.a, at(e));
          setDrag(null);
          if (b.w > 0.03 && b.h > 0.02) onBox(b);
        }}
        onPointerCancel={() => setDrag(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="お薬手帳の写真" draggable={false} className="block max-h-[60vh] max-w-full" />
        {shown && <div aria-hidden className="pointer-events-none absolute border-2 border-ai shadow-[0_0_0_9999px_rgba(38,34,28,0.45)]" style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%`, width: `${shown.w * 100}%`, height: `${shown.h * 100}%` }} />}
      </div>
    </div>
  );
}
