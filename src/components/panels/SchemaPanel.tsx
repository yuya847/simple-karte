"use client";

import { Eraser, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface Figure {
  caption: string;
  dataUrl: string;
}

const W = 360;
const H = 360;
const TEMPLATES = ["全身（前）", "胸部", "腹部（4分割）", "下肢（両側）"] as const;
type Template = (typeof TEMPLATES)[number];
const COLORS = [
  { c: "#b5402b", label: "赤" },
  { c: "#2b4a7e", label: "青" },
  { c: "#26221c", label: "黒" },
];

/** The outline of a body part, drawn by code in light grey (original simple line drawings). */
function outline(ctx: CanvasRenderingContext2D, t: Template) {
  ctx.save();
  ctx.strokeStyle = "#a9a294";
  ctx.lineWidth = 1.5;
  const path = (f: () => void) => {
    ctx.beginPath();
    f();
    ctx.stroke();
  };
  if (t === "全身（前）") {
    path(() => ctx.ellipse(180, 42, 20, 24, 0, 0, Math.PI * 2));
    path(() => {
      ctx.moveTo(170, 66);
      ctx.lineTo(170, 76);
      ctx.moveTo(190, 66);
      ctx.lineTo(190, 76);
    });
    path(() => {
      ctx.moveTo(130, 84);
      ctx.quadraticCurveTo(180, 72, 230, 84);
      ctx.lineTo(222, 190);
      ctx.lineTo(214, 200);
      ctx.lineTo(146, 200);
      ctx.lineTo(138, 190);
      ctx.closePath();
    });
    for (const s of [-1, 1]) {
      path(() => {
        ctx.moveTo(180 + s * 50, 84);
        ctx.lineTo(180 + s * 70, 190);
        ctx.lineTo(180 + s * 74, 236);
        ctx.moveTo(180 + s * 42, 100);
        ctx.lineTo(180 + s * 56, 190);
        ctx.lineTo(180 + s * 60, 236);
      });
      path(() => {
        ctx.moveTo(180 + s * 34, 200);
        ctx.lineTo(180 + s * 30, 340);
        ctx.moveTo(180 + s * 2, 206);
        ctx.lineTo(180 + s * 8, 340);
      });
    }
  } else if (t === "胸部") {
    path(() => {
      ctx.moveTo(60, 70);
      ctx.quadraticCurveTo(180, 40, 300, 70);
      ctx.lineTo(300, 320);
      ctx.lineTo(60, 320);
      ctx.closePath();
    });
    path(() => ctx.ellipse(125, 190, 55, 100, 0, 0, Math.PI * 2));
    path(() => ctx.ellipse(235, 190, 55, 100, 0, 0, Math.PI * 2));
    path(() => {
      ctx.moveTo(180, 60);
      ctx.lineTo(180, 320);
    });
  } else if (t === "腹部（4分割）") {
    path(() => {
      ctx.moveTo(60, 60);
      ctx.quadraticCurveTo(180, 120, 300, 60);
      ctx.lineTo(300, 330);
      ctx.lineTo(60, 330);
      ctx.closePath();
    });
    path(() => ctx.arc(180, 200, 5, 0, Math.PI * 2));
    ctx.setLineDash([4, 4]);
    path(() => {
      ctx.moveTo(180, 90);
      ctx.lineTo(180, 330);
      ctx.moveTo(60, 200);
      ctx.lineTo(300, 200);
    });
    ctx.setLineDash([]);
    ctx.fillStyle = "#a9a294";
    ctx.font = "11px sans-serif";
    ctx.fillText("右上", 80, 120);
    ctx.fillText("左上", 255, 120);
    ctx.fillText("右下", 80, 315);
    ctx.fillText("左下", 255, 315);
  } else {
    for (const x of [130, 230]) {
      path(() => {
        ctx.moveTo(x - 35, 20);
        ctx.lineTo(x - 28, 180);
        ctx.lineTo(x - 22, 300);
        ctx.lineTo(x - 30, 340);
        ctx.lineTo(x + 20, 340);
        ctx.lineTo(x + 18, 300);
        ctx.lineTo(x + 24, 180);
        ctx.lineTo(x + 30, 20);
      });
      path(() => ctx.ellipse(x, 180, 14, 10, 0, 0, Math.PI * 2));
    }
    ctx.fillStyle = "#a9a294";
    ctx.font = "11px sans-serif";
    ctx.fillText("右", 100, 14);
    ctx.fillText("左", 240, 14);
  }
  ctx.restore();
}

/**
 * シェーマ: draw on a body outline with a finger, Apple Pencil or mouse, write a caption, and put it
 * into today's note (it is kept with the note when confirmed).
 */
export function SchemaPanel({ onAttach }: { onAttach: (f: Figure) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<{ color: string; pts: { x: number; y: number }[] }[]>([]);
  const drawing = useRef(false);
  const [tpl, setTpl] = useState<Template>("腹部（4分割）");
  const [color, setColor] = useState(COLORS[0].c);
  const [caption, setCaption] = useState("");
  const [count, setCount] = useState(0);

  const redraw = () => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    outline(ctx, tpl);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    for (const s of strokes.current) {
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      s.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
  };
  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = W * ratio;
    c.height = H * ratio;
    redraw();
  });
  const at = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  return (
    <div className="space-y-2 text-[12px]">
      <div className="flex flex-wrap items-center gap-1.5">
        {TEMPLATES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tpl === t}
            onClick={() => {
              setTpl(t);
              strokes.current = [];
              setCount(0);
            }}
            className={`rounded border px-2 py-0.5 pointer-coarse:py-1.5 ${tpl === t ? "border-ink bg-ink text-white" : "border-rule"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {COLORS.map((c) => (
          <button key={c.c} type="button" aria-label={`${c.label}で描く`} aria-pressed={color === c.c} onClick={() => setColor(c.c)} className={`size-6 rounded-full border-2 ${color === c.c ? "border-ink" : "border-transparent"}`} style={{ background: c.c }} />
        ))}
        <button
          type="button"
          onClick={() => {
            strokes.current.pop();
            setCount(strokes.current.length);
          }}
          className="ml-2 flex items-center gap-1 rounded border border-rule px-2 py-0.5"
        >
          <Undo2 size={13} />
          1つ戻す
        </button>
        <button
          type="button"
          onClick={() => {
            strokes.current = [];
            setCount(0);
          }}
          className="flex items-center gap-1 rounded border border-rule px-2 py-0.5"
        >
          <Eraser size={13} />
          消す
        </button>
      </div>
      <canvas
        ref={canvas}
        aria-label={`シェーマ：${tpl}（指・ペン・マウスで描く）`}
        style={{ width: W, height: H, touchAction: "none" }}
        className="max-w-full rounded border border-rule bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          strokes.current.push({ color, pts: [at(e)] });
          redraw();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          strokes.current.at(-1)!.pts.push(at(e));
          redraw();
        }}
        onPointerUp={() => {
          drawing.current = false;
          setCount(strokes.current.length);
        }}
      />
      <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="説明（例：右下腹部に圧痛、反跳痛なし）" aria-label="シェーマの説明" className="w-full rounded border border-rule bg-paper px-2 py-1" />
      <button
        type="button"
        disabled={!count || !caption.trim()}
        onClick={() => {
          onAttach({ caption: `${tpl}：${caption.trim()}`, dataUrl: canvas.current!.toDataURL("image/png") });
          strokes.current = [];
          setCount(0);
          setCaption("");
        }}
        className="w-full rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
      >
        今日の記事に貼る
      </button>
      <p className="text-[11px] text-ink-faint">図は記事を確定すると一緒に残ります（記事の O）に「シェーマ」の行が入ります）。</p>
    </div>
  );
}
