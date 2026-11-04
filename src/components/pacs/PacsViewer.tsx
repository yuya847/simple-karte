"use client";

import {
  CircleDashed,
  Columns2,
  Contrast,
  DraftingCompass,
  FlipHorizontal2,
  FlipVertical2,
  Hand,
  Keyboard,
  Link2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Ruler,
  SunMoon,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { creditLine, PUBLIC_IMAGE_NOTE } from "@/lib/image-credits";
import { getFrame, valueRange } from "@/lib/pacs/frames";
import { distance, ratio, type Measurement } from "@/lib/pacs/measure";
import { creditsOf } from "@/lib/pacs/photos";
import { buildPacsStudies, findPrior, positionLabel } from "@/lib/pacs/studies";
import type { PacsStudy, SeriesSpec } from "@/lib/pacs/types";
import { cineNext, clampZoom, nearestSlice, rotate, stepSlice, type ViewState } from "@/lib/pacs/viewport";
import { autoWindow } from "@/lib/pacs/window";
import type { ImagingStudy, Patient } from "@/lib/types";
import { KeyHelp } from "./KeyHelp";
import { Thumbnail } from "./Thumbnail";
import { Viewport, type Draft, type Tool } from "./Viewport";

type ViewChange = ViewState | ((v: ViewState) => ViewState);

interface Pane {
  studyId: string;
  seriesIdx: number;
  view: ViewState;
}

const BASE_VIEW: ViewState = { zoom: 1, panX: 0, panY: 0, rotation: 0, flipH: false, flipV: false, ww: 400, wl: 40, invert: false, slice: 0 };

/** シリーズを開いたときの表示：真ん中のスライス、既定の WW/WL（X線は画像から決める）。 */
function freshView(series: SeriesSpec | undefined): ViewState {
  if (!series) return BASE_VIEW;
  const slice = Math.floor(series.positions.length / 2);
  const w = series.window === "auto" ? autoWindow(getFrame(series, slice)) : series.window;
  return { ...BASE_VIEW, slice, ww: w.ww, wl: w.wl };
}

function paneFor(p: PacsStudy | undefined): Pane {
  return { studyId: p?.study.id ?? "", seriesIdx: 0, view: freshView(p?.series[0]) };
}

const TOOLS: { tool: Tool; label: string; key: string; Icon: typeof Hand }[] = [
  { tool: "window", label: "WW/WL", key: "W", Icon: Contrast },
  { tool: "pan", label: "移動", key: "P", Icon: Hand },
  { tool: "zoom", label: "拡大縮小", key: "Z", Icon: ZoomIn },
  { tool: "distance", label: "距離", key: "D", Icon: Ruler },
  { tool: "angle", label: "角度", key: "A", Icon: DraftingCompass },
  { tool: "roi", label: "ROI（楕円）", key: "R", Icon: CircleDashed },
];

const STATUS_STYLE: Record<PacsStudy["status"], string> = {
  読影済み: "bg-wakatake-soft text-wakatake",
  読影待ち: "bg-yamabuki-soft text-yamabuki",
  未実施: "bg-paper text-ink-faint",
};

const noSubscribe = () => () => {};

/**
 * 放射線画像のビューア（PACS ビューアの試作）。画像はすべてコードで作った架空の合成画像。
 * AI は使わない。所見を書いたり異常を判定したりせず、計測はコードで計算して式を出すだけ。
 */
export function PacsViewer({ patient, today, studies, focus }: { patient: Patient; today: CalendarDate; studies: ImagingStudy[]; focus?: string }) {
  const pacsList = useMemo(() => buildPacsStudies(patient, studies), [patient, studies]);
  // Opened from an imaging order on the left: that study first.
  const [panes, setPanes] = useState<Pane[]>(() => [paneFor(pacsList.find((s) => s.study.id === focus && s.series.length > 0) ?? pacsList.find((s) => s.series.length > 0) ?? pacsList[0])]);
  const [active, setActive] = useState(0);
  const [tool, setTool] = useState<Tool>("window");
  const [measures, setMeasures] = useState<Record<string, Measurement[]>>({});
  const [draft, setDraft] = useState<{ pane: number; d: Draft } | null>(null);
  const [syncSlice, setSyncSlice] = useState(true);
  const [syncZoom, setSyncZoom] = useState(true);
  const [cine, setCine] = useState(false);
  const [fps, setFps] = useState(8);
  const [bounce, setBounce] = useState(false);
  const [full, setFull] = useState(false);
  const [help, setHelp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const cineDir = useRef<1 | -1>(1);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);

  const seriesOf = (p: Pane) => pacsList.find((s) => s.study.id === p.studyId)?.series[p.seriesIdx];
  const resolved = panes.map((p) => {
    const pacs = pacsList.find((s) => s.study.id === p.studyId) ?? null;
    return { ...p, pacs, series: pacs?.series[p.seriesIdx] ?? null };
  });
  const ai = Math.min(active, resolved.length - 1);
  const cur = resolved[ai];
  const comparing = panes.length === 2;
  const prior = cur?.pacs && !cur.pacs.study.pending ? findPrior(studies, cur.pacs.study) : undefined;
  const priorPacs = prior ? pacsList.find((s) => s.study.id === prior.id) : undefined;
  const view = cur?.view ?? BASE_VIEW;
  const series = cur?.series ?? null;
  const count = series?.positions.length ?? 0;
  const photo = series?.gen.kind === "photo";
  const [lo, hi] = series ? valueRange(series) : [0, 1];
  const keyOf = (p: (typeof resolved)[number]) => (p.series ? `${p.series.uid}#${p.view.slice}` : "");

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, [full]);

  // 表示を変える（比較表示では、拡大・移動・回転とスライスの位置をもう一方にそろえる）
  const setView = (i: number, change: ViewChange) =>
    setPanes((ps) => {
      if (!ps[i]) return ps;
      const next = typeof change === "function" ? change(ps[i].view) : change;
      const out = ps.map((p, k) => (k === i ? { ...p, view: next } : p));
      if (out.length < 2) return out;
      const j = 1 - i;
      const a = seriesOf(ps[i]);
      const b = seriesOf(ps[j]);
      let v = out[j].view;
      if (syncZoom) v = { ...v, zoom: next.zoom, panX: next.panX, panY: next.panY, rotation: next.rotation, flipH: next.flipH, flipV: next.flipV };
      if (syncSlice && a && b && a.positions.length > 1 && b.positions.length > 1 && next.slice !== ps[i].view.slice) v = { ...v, slice: nearestSlice(a.positions[next.slice], b.positions) };
      out[j] = { ...out[j], view: v };
      return out;
    });
  // いまの表示から変える（キーを速く押しても取りこぼさないよう、最新の状態に対して変える）
  const update = (fn: (v: ViewState) => Partial<ViewState>) => {
    if (series) setView(ai, (v) => ({ ...v, ...fn(v) }));
  };
  const patch = (over: Partial<ViewState>) => update(() => over);
  const step = (d: number) => update((v) => ({ slice: stepSlice(v.slice, d, count) }));
  const zoomBy = (f: number) => update((v) => ({ zoom: clampZoom(v.zoom * f) }));
  const autoWl = () => {
    if (series) patch(autoWindow(getFrame(series, view.slice)));
  };
  const presets = series?.presets ?? [];
  const applyPreset = (k: number) => {
    if (k < presets.length) patch({ ww: presets[k].ww, wl: presets[k].wl });
    else if (k === presets.length) autoWl();
  };
  const reset = () => {
    if (series) setView(ai, (v) => ({ ...freshView(series), slice: v.slice }));
  };

  const selectStudy = (id: string) => {
    const p = pacsList.find((s) => s.study.id === id);
    setPanes((ps) => ps.map((x, k) => (k === ai ? paneFor(p) : x)));
    setDraft(null);
    setCine(false);
  };
  const selectSeries = (idx: number) => {
    const s = cur?.pacs?.series[idx];
    if (!s) return;
    setPanes((ps) => ps.map((x, k) => (k === ai ? { ...x, seriesIdx: idx, view: freshView(s) } : x)));
    setDraft(null);
  };
  const nextSeries = (d: number) => {
    const n = cur?.pacs?.series.length ?? 0;
    if (n > 1) selectSeries(Math.min(n - 1, Math.max(0, (cur?.seriesIdx ?? 0) + d)));
  };
  const toggleCompare = () => {
    setDraft(null);
    if (comparing) {
      setPanes([panes[ai]]);
      setActive(0);
      return;
    }
    if (!priorPacs || !cur) return;
    const before = paneFor(priorPacs);
    const a = cur.series;
    const b = priorPacs.series[0];
    let v = before.view;
    if (syncZoom) v = { ...v, zoom: view.zoom, panX: view.panX, panY: view.panY, rotation: view.rotation, flipH: view.flipH, flipV: view.flipV };
    if (syncSlice && a && b && a.positions.length > 1 && b.positions.length > 1) v = { ...v, slice: nearestSlice(a.positions[view.slice], b.positions) };
    setPanes([{ ...before, view: v }, panes[ai]]);
    setActive(1);
  };

  const addMeasure = (i: number, m: Measurement) => {
    const k = keyOf(resolved[i]);
    setMeasures((all) => ({ ...all, [k]: [...(all[k] ?? []), m] }));
  };
  const removeMeasure = (k: string, id?: string) => setMeasures((all) => ({ ...all, [k]: id ? (all[k] ?? []).filter((m) => m.id !== id) : [] }));
  const popMeasure = () => {
    if (!cur) return;
    const k = keyOf(cur);
    setMeasures((all) => ({ ...all, [k]: (all[k] ?? []).slice(0, -1) }));
  };

  // シネ再生
  const tick = useEffectEvent(() => {
    if (!series || count <= 1) {
      setCine(false);
      return;
    }
    const r = cineNext(view.slice, count, cineDir.current, bounce ? "bounce" : "loop");
    cineDir.current = r.dir;
    setView(ai, (v) => ({ ...v, slice: r.index }));
  });
  useEffect(() => {
    if (!cine) return;
    const t = window.setInterval(() => tick(), 1000 / fps);
    return () => window.clearInterval(t);
  }, [cine, fps]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if ((tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") && e.key !== "Escape") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const run = (): boolean => {
      switch (k) {
        case "ArrowUp":
          step(-1);
          return true;
        case "ArrowDown":
          step(1);
          return true;
        case "PageUp":
          step(-5);
          return true;
        case "PageDown":
          step(5);
          return true;
        case "Home":
          patch({ slice: 0 });
          return true;
        case "End":
          patch({ slice: Math.max(0, count - 1) });
          return true;
        case "ArrowLeft":
          // シリーズが 1 つだけなら、← → でも画像を送る（公開画像の複数枚など）
          if ((cur?.pacs?.series.length ?? 0) <= 1 && count > 1) step(-1);
          else nextSeries(-1);
          return true;
        case "ArrowRight":
          if ((cur?.pacs?.series.length ?? 0) <= 1 && count > 1) step(1);
          else nextSeries(1);
          return true;
        case " ":
          if (count > 1) setCine((c) => !c);
          return true;
        case "Escape":
          if (draft) setDraft(null);
          else if (help) setHelp(false);
          else if (full) setFull(false);
          else return false;
          return true;
        case "Delete":
        case "Backspace":
          popMeasure();
          return true;
        case "+":
        case "=":
          zoomBy(1.25);
          return true;
        case "-":
        case "_":
          zoomBy(0.8);
          return true;
        case "[":
          update((v) => ({ rotation: rotate(v.rotation, -1) }));
          return true;
        case "]":
          update((v) => ({ rotation: rotate(v.rotation, 1) }));
          return true;
        case "?":
          setHelp((h) => !h);
          return true;
        case "0":
          reset();
          return true;
      }
      if (/^[1-9]$/.test(k)) {
        applyPreset(Number(k) - 1);
        return true;
      }
      const tl = TOOLS.find((t) => t.key.toLowerCase() === k.toLowerCase());
      if (tl) {
        setTool(tl.tool);
        setDraft(null);
        return true;
      }
      switch (k.toLowerCase()) {
        case "i":
          update((v) => ({ invert: !v.invert }));
          return true;
        case "h":
          update((v) => ({ flipH: !v.flipH }));
          return true;
        case "v":
          update((v) => ({ flipV: !v.flipV }));
          return true;
        case "c":
          toggleCompare();
          return true;
        case "f":
          setFull((f) => !f);
          return true;
      }
      return false;
    };
    if (run()) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  if (pacsList.length === 0) return <p className="text-sm text-ink-faint">検査なし</p>;

  const disabled = !series;
  const toolbar = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <Group>
        {TOOLS.map(({ tool: t, label, key, Icon }) => (
          <Btn
            key={t}
            label={`${label}（${key}）`}
            on={tool === t}
            onClick={() => {
              setTool(t);
              setDraft(null);
            }}
          >
            <Icon size={15} />
          </Btn>
        ))}
      </Group>
      <Group>
        {presets.map((p, i) => (
          <Btn key={p.key} label={`${p.label}：WW ${p.ww} / WL ${p.wl}（${i + 1}）`} on={view.ww === p.ww && view.wl === p.wl} onClick={() => applyPreset(i)} text>
            {p.label}
          </Btn>
        ))}
        <Btn label={`画像から自動（${presets.length + 1}）`} onClick={autoWl} disabled={disabled} text>
          自動
        </Btn>
        <Btn label="白黒の反転（I）" on={view.invert} onClick={() => update((v) => ({ invert: !v.invert }))} disabled={disabled}>
          <SunMoon size={15} />
        </Btn>
      </Group>
      <Group>
        <Btn label="縮小（−）" onClick={() => zoomBy(0.8)} disabled={disabled}>
          <ZoomOut size={15} />
        </Btn>
        <Btn label="拡大（+）" onClick={() => zoomBy(1.25)} disabled={disabled}>
          <ZoomIn size={15} />
        </Btn>
        <Btn label="左へ 90° 回転（[）" onClick={() => update((v) => ({ rotation: rotate(v.rotation, -1) }))} disabled={disabled}>
          <RotateCcw size={15} />
        </Btn>
        <Btn label="右へ 90° 回転（]）" onClick={() => update((v) => ({ rotation: rotate(v.rotation, 1) }))} disabled={disabled}>
          <RotateCw size={15} />
        </Btn>
        <Btn label="左右の反転（H）" on={view.flipH} onClick={() => update((v) => ({ flipH: !v.flipH }))} disabled={disabled}>
          <FlipHorizontal2 size={15} />
        </Btn>
        <Btn label="上下の反転（V）" on={view.flipV} onClick={() => update((v) => ({ flipV: !v.flipV }))} disabled={disabled}>
          <FlipVertical2 size={15} />
        </Btn>
        <Btn label="表示を元に戻す（0）" onClick={reset} disabled={disabled}>
          <Undo2 size={15} />
        </Btn>
      </Group>
      <Group>
        <Btn label={cine ? "シネ再生を止める（Space）" : "シネ再生（Space）"} on={cine} onClick={() => setCine((c) => !c)} disabled={count <= 1}>
          {cine ? <Pause size={15} /> : <Play size={15} />}
        </Btn>
        <select
          value={fps}
          onChange={(e) => setFps(Number(e.target.value))}
          disabled={count <= 1}
          aria-label="シネ再生の速さ"
          className="nums h-7 rounded border border-rule bg-sheet px-1 text-[12px] disabled:opacity-40"
        >
          {[4, 8, 12, 20].map((n) => (
            <option key={n} value={n}>
              {n} 枚/秒
            </option>
          ))}
        </select>
        <Btn label={bounce ? "往復で再生中（押すと、最後まで行ったら最初から）" : "最後まで行ったら最初から（押すと往復）"} on={bounce} onClick={() => setBounce((b) => !b)} disabled={count <= 1}>
          <Repeat size={15} />
        </Btn>
      </Group>
      <Group>
        <Btn label={comparing ? "比較表示をやめる（C）" : priorPacs ? "前回と今回を並べる（C）" : "同じ部位の前回の検査がありません"} on={comparing} onClick={toggleCompare} disabled={!comparing && !priorPacs} text>
          <Columns2 size={15} />
          比較
        </Btn>
        {comparing && (
          <>
            <Btn label="スライスの位置をそろえる" on={syncSlice} onClick={() => setSyncSlice((s) => !s)} text>
              <Link2 size={13} />
              スライス
            </Btn>
            <Btn label="拡大・移動・回転をそろえる" on={syncZoom} onClick={() => setSyncZoom((s) => !s)} text>
              <Link2 size={13} />
              拡大
            </Btn>
          </>
        )}
      </Group>
      <div className="ml-auto flex gap-1">
        <Btn label="キーボード操作の一覧（?）" on={help} onClick={() => setHelp((h) => !h)}>
          <Keyboard size={15} />
        </Btn>
        <Btn label={full ? "全画面を閉じる（F・Esc）" : "全画面（F）"} onClick={() => setFull((f) => !f)}>
          {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </Btn>
      </div>
    </div>
  );

  const studyList = (
    <ul className="space-y-1" aria-label="検査の一覧">
      {pacsList.map((p) => {
        const s = p.study;
        const on = resolved.some((r) => r.studyId === s.id);
        const here = cur?.studyId === s.id;
        return (
          <li key={s.id}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectStudy(s.id)}
              className={`nums w-full rounded-md px-2 py-1.5 text-left text-[13px] ${here ? "bg-ai text-white" : on ? "bg-ai-soft" : "hover:bg-paper"}`}
            >
              <div className={`flex items-center justify-between text-[11px] ${here ? "text-white/80" : "text-ink-faint"}`}>
                <span>
                  {formatShort(addDays(today, s.day))}
                  {s.time ? ` ${s.time}` : ""}
                </span>
                {prior?.id === s.id && !comparing && <span className={here ? "" : "text-ai"}>前回</span>}
              </div>
              <div className="leading-snug">
                {s.modality} {s.region}
              </div>
              <div className="mt-0.5 flex items-center gap-1">
                <span className={`rounded px-1 text-[10px] ${STATUS_STYLE[p.status]}`}>{p.status}</span>
                <span className={`text-[10px] ${here ? "text-white/80" : "text-ink-faint"}`}>{p.series.length ? `${p.series.length} シリーズ` : "画像なし"}</span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const paneViews = resolved.map((p, i) => (
    <div key={i} className="min-h-0">
      <Viewport
        patient={patient}
        today={today}
        pacs={p.pacs}
        series={p.series}
        view={p.view}
        onView={(next) => setView(i, next)}
        tool={tool}
        measurements={measures[keyOf(p)] ?? []}
        onMeasure={(m) => addMeasure(i, m)}
        draft={draft?.pane === i ? draft.d : null}
        onDraft={(d) => setDraft(d ? { pane: i, d } : null)}
        active={comparing && i === ai}
        onActivate={() => {
          if (i !== ai) setDraft(null);
          setActive(i);
        }}
        tag={comparing ? (i === 0 ? "前回" : "今回") : undefined}
        newId={() => `m${++idRef.current}`}
      />
    </div>
  ));

  const sliceBar = series && count > 1 && (
    <div className="flex items-center gap-2 text-[12px]">
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => step(-1)} className="rounded px-1.5 text-ink-soft hover:bg-paper" aria-label={photo ? "前の画像" : "前のスライス"}>
        {photo ? "←" : "↑"}
      </button>
      <input type="range" min={0} max={count - 1} value={view.slice} onChange={(e) => patch({ slice: Number(e.target.value) })} className="flex-1 accent-ai" aria-label={photo ? "画像" : "スライス"} />
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => step(1)} className="rounded px-1.5 text-ink-soft hover:bg-paper" aria-label={photo ? "次の画像" : "次のスライス"}>
        {photo ? "→" : "↓"}
      </button>
      <span className="nums w-[11em] text-right text-ink-soft">
        {view.slice + 1} / {count}　{positionLabel(series, view.slice)}
      </span>
    </div>
  );

  // 明るさ・コントラスト（WW/WL と同じもの。右へ動かすほど明るく・くっきり）
  const levelBar = series && (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-soft">
      <label className="flex min-w-[12em] flex-1 items-center gap-2">
        <span className="shrink-0">明るさ</span>
        <input type="range" min={lo} max={hi} value={lo + hi - view.wl} onChange={(e) => patch({ wl: lo + hi - Number(e.target.value) })} className="flex-1 accent-ai" aria-label="明るさ（WL）" />
      </label>
      <label className="flex min-w-[12em] flex-1 items-center gap-2">
        <span className="shrink-0">コントラスト</span>
        <input type="range" min={1} max={hi - lo} value={hi - lo + 1 - view.ww} onChange={(e) => patch({ ww: hi - lo + 1 - Number(e.target.value) })} className="flex-1 accent-ai" aria-label="コントラスト（WW）" />
      </label>
      <span className="nums">
        WW {view.ww} / WL {view.wl}
      </span>
      <p className="hint basis-full">明るさは WL（ウィンドウレベル）、コントラストは WW（ウィンドウ幅）を動かします。ドラッグ（W）やプリセットと同じ値です。「元に戻す」（0）で開いたときの値に戻ります。</p>
    </div>
  );

  const seriesStrip = cur?.pacs && cur.pacs.series.length > 0 && (
    <div className="scroll-thin flex gap-1.5 overflow-x-auto pb-1" aria-label="シリーズ">
      {cur.pacs.series.map((s, i) => (
        <Thumbnail key={s.uid} series={s} selected={i === cur.seriesIdx} onSelect={() => selectSeries(i)} />
      ))}
    </div>
  );

  const measurePanel = (
    <div>
      <h4 className="text-sm font-bold">計測</h4>
      <p className="hint text-[11px] text-ink-faint">コードで計算した値と式です。所見の判定はしません。画像ごとに覚え、画像を変えると別になります（保存はしません）。</p>
      {resolved.map((p, i) => {
        const k = keyOf(p);
        const list = measures[k] ?? [];
        const dists = p.series ? list.filter((m) => m.kind === "distance").map((m) => distance(m.points[0], m.points[1], p.series!.spacing).mm) : [];
        const r = dists.length >= 2 ? ratio(dists[0], dists[1]) : null;
        if (!p.series) return null;
        return (
          <div key={i} className="mt-1.5">
            {comparing && <div className="text-[11px] font-bold text-ink-soft">{i === 0 ? "前回" : "今回"}</div>}
            {list.length === 0 ? (
              <p className="text-[12px] text-ink-faint">この画像の計測はありません（距離 D・角度 A・ROI R）。</p>
            ) : (
              <ul className="space-y-1">
                {list.map((m, n) => (
                  <li key={m.id} className="rounded border border-rule-soft bg-sheet px-2 py-1 text-[12px]">
                    <div className="flex items-start justify-between gap-2">
                      <span>
                        <span className="text-ink-faint">{m.kind === "distance" ? `距離 ${list.filter((x, j) => x.kind === "distance" && j <= n).length}` : m.kind === "angle" ? "角度" : "ROI"}</span> <span className="nums font-bold">{m.value}</span>
                      </span>
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => removeMeasure(k, m.id)} aria-label="この計測を消す" className="rounded p-0.5 text-ink-faint hover:bg-shu-soft hover:text-shu">
                        <X size={13} />
                      </button>
                    </div>
                    <div className="nums mt-0.5 space-y-px text-[11px] text-ink-soft">
                      {m.formula.map((f) => (
                        <div key={f}>{f}</div>
                      ))}
                    </div>
                  </li>
                ))}
                {r && (
                  <li className="rounded border border-rule-soft bg-sheet px-2 py-1 text-[12px]">
                    <span className="text-ink-faint">距離 1 ÷ 距離 2（例：心胸郭比＝心臓の幅 ÷ 胸郭の幅）</span>
                    <div className="nums font-bold">{r.formula}</div>
                  </li>
                )}
                <li>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => removeMeasure(k)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-shu hover:bg-shu-soft">
                    <Trash2 size={12} />
                    この画像の計測を全部消す
                  </button>
                </li>
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );

  const reportPanel = (
    <div className="space-y-2">
      {resolved.map((p, i) =>
        p.pacs ? (
          <div key={i}>
            <h4 className="text-sm font-bold">
              読影レポート
              <span className="ml-2 text-[12px] font-normal text-ink-faint">
                {comparing ? `${i === 0 ? "前回" : "今回"}　` : ""}
                {formatShort(addDays(today, p.pacs.study.day))} {p.pacs.study.modality} {p.pacs.study.region}
              </span>
            </h4>
            <p className="mt-1 text-[13px] leading-relaxed">{p.pacs.study.report}</p>
            <p className="mt-1 text-[11px] text-ink-faint">{p.pacs.study.reader}</p>
            {creditsOf(p.pacs.series.flatMap((s) => (s.gen.kind === "photo" ? s.gen.images : []))).map((c) => (
              <p key={c.id} className="hint mt-1 text-[11px]">
                画像の出典：{creditLine(c)}　{c.what}
                <a href={c.page} target="_blank" rel="noreferrer" className="underline">
                  出典のページ
                </a>
                {c.licenseUrl && (
                  <>
                    ・
                    <a href={c.licenseUrl} target="_blank" rel="noreferrer" className="underline">
                      ライセンス
                    </a>
                  </>
                )}
              </p>
            ))}
          </div>
        ) : null,
      )}
    </div>
  );

  const body = (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="画像ビューア（キーボードで操作できます。? で一覧）"
      className={full ? "@container flex h-full flex-col gap-2 p-3 outline-none" : "@container space-y-2 outline-none"}
    >
      {full && (
        <div className="flex items-center justify-between">
          <h2 className="font-bold">
            放射線画像<span className="ml-2 text-sm font-normal text-ink-soft">{patient.name}（ID {patient.id}）　画像は架空の合成画像か、公開データの教材用の画像です（この患者のものではありません）</span>
          </h2>
          <button type="button" onClick={() => setFull(false)} aria-label="全画面を閉じる" className="rounded p-1 text-ink-faint hover:bg-sheet hover:text-ink">
            <X size={18} />
          </button>
        </div>
      )}
      {toolbar}
      {help && !full && (
        <div className="rounded-md border border-rule bg-paper p-2">
          <KeyHelp />
        </div>
      )}
      <div className={full ? "grid min-h-0 flex-1 grid-cols-[200px_1fr_320px] gap-3" : "grid gap-3 @lg:grid-cols-[150px_1fr]"}>
        <aside className={full ? "scroll-thin min-h-0 overflow-y-auto" : "scroll-thin max-h-40 overflow-y-auto @lg:max-h-none"}>{studyList}</aside>
        <section className={full ? "flex min-h-0 flex-col gap-2" : "min-w-0 space-y-2"}>
          <div className={`grid gap-1.5 ${comparing ? "grid-cols-2" : "grid-cols-1"} ${full ? "min-h-0 flex-1" : "h-[460px]"}`}>{paneViews}</div>
          {sliceBar}
          {levelBar}
          {resolved.some((p) => p.series?.gen.kind === "photo") && <p className="text-[11px] text-ink-faint">{PUBLIC_IMAGE_NOTE}</p>}
          {seriesStrip}
        </section>
        {full && (
          <aside className="scroll-thin min-h-0 space-y-4 overflow-y-auto">
            {reportPanel}
            {measurePanel}
            <div>
              <h4 className="mb-1 text-sm font-bold">キーボード操作</h4>
              <KeyHelp columns={1} />
            </div>
          </aside>
        )}
      </div>
      {!full && (
        <>
          {reportPanel}
          {measurePanel}
        </>
      )}
    </div>
  );

  return full && mounted ? createPortal(<div className="fixed inset-0 z-[80] bg-paper">{body}</div>, document.body) : body;
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5 rounded-md border border-rule bg-sheet p-0.5">{children}</div>;
}

function Btn({ children, label, on, onClick, disabled, text }: { children: React.ReactNode; label: string; on?: boolean; onClick: () => void; disabled?: boolean; text?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      // ボタンを押してもフォーカスをビューアに残す（キーボード操作が続けて使えるように）
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-7 items-center gap-1 rounded ${text ? "px-2 text-[12px]" : "w-7 justify-center"} ${on ? "bg-ai text-white" : "text-ink-soft hover:bg-paper hover:text-ink"} disabled:pointer-events-none disabled:opacity-35`}
    >
      {children}
    </button>
  );
}
