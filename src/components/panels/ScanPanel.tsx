"use client";

import { ExternalLink, FileText, ImagePlus, Sparkles, Undo2 } from "lucide-react";
import { useState } from "react";
import type { Patient } from "@/lib/types";
import { dataUrlBlob, fileProblem, fitProblem, fitSize, formProblem, kb, mb, SCAN_LIMITS, SCAN_SOURCES, SCAN_TYPES, SHRINK_STEPS, totalKept, type ScanDoc, type ScanType } from "@/lib/scans";
import { Sources } from "../DeskParts";
import { useMe } from "../RoleContext";

interface Ready {
  dataUrl: string;
  mime: ScanDoc["mime"];
  width?: number;
  height?: number;
  original: ScanDoc["original"];
  sample?: boolean;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error("画像を読めませんでした（この端末のブラウザが開けない形式かもしれません）。"));
    img.src = src;
  });

/** Draw the image smaller as JPEG, trying smaller sizes until it fits one file's limit. */
async function shrink(src: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(src);
  let last = { dataUrl: "", width: 0, height: 0 };
  for (const step of SHRINK_STEPS) {
    const { w, h } = fitSize(img.naturalWidth, img.naturalHeight, step.maxSide);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    if (!g) throw new Error("画像を小さくできませんでした。");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    last = { dataUrl: c.toDataURL("image/jpeg", step.quality), width: w, height: h };
    if (last.dataUrl.length <= SCAN_LIMITS.perFile) break;
  }
  return last;
}

const readAsDataUrl = (f: Blob) =>
  new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(new Error("ファイルを読めませんでした。"));
    r.readAsDataURL(f);
  });

/** A fictional 紹介状 drawn on a canvas (no real paper is needed to try this). */
function sampleImage(patientName: string, today: string): string {
  const c = document.createElement("canvas");
  c.width = 1240;
  c.height = 1754;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fbfaf6";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#26221c";
  g.font = "bold 64px sans-serif";
  g.fillText("診療情報提供書", 120, 200);
  g.font = "40px sans-serif";
  g.fillText(`架空総合病院 総合診療科 御侍史`, 120, 320);
  g.fillText(`患者：${patientName} 様（架空）`, 120, 400);
  g.fillText(`紹介日：${today}`, 120, 470);
  g.font = "36px sans-serif";
  ["紹介目的：精査と加療のお願い（見本の文です）", "既往歴：高血圧症（見本）", "処方：見本の処方（実在の処方ではありません）", "経過：この紙は Simple Karte の取込の見本で、", "実在の患者・医療機関のものではありません。"].forEach((t, i) => g.fillText(t, 120, 600 + i * 70));
  g.strokeStyle = "#d9cfba";
  g.lineWidth = 3;
  for (let y = 1000; y < 1500; y += 70) {
    g.beginPath();
    g.moveTo(120, y);
    g.lineTo(1120, y);
    g.stroke();
  }
  g.font = "40px sans-serif";
  g.fillText("〇〇内科クリニック（架空） 院長 架空 太郎", 360, 1620);
  g.save();
  g.translate(620, 900);
  g.rotate(-0.4);
  g.fillStyle = "rgba(181,64,43,0.18)";
  g.font = "bold 200px sans-serif";
  g.fillText("見本（架空）", -560, 60);
  g.restore();
  return c.toDataURL("image/png");
}

const openKept = (s: ScanDoc) => {
  const blob = dataUrlBlob(s.dataUrl);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

/**
 * スキャン取込: a paper document or a photo (image or PDF) attached to the patient's 文書 with its type, the
 * document's date and who took it in. Images are made smaller (JPEG) before they are kept; a PDF is kept as
 * it is when it is small enough. Kept with the day's records; withdrawing keeps the line, not the image.
 */
export function ScanPanel({ patient, scans, today, onAdd, onWithdraw }: { patient: Patient; scans: ScanDoc[]; today: string; onAdd: (s: Omit<ScanDoc, "id" | "patientId" | "by" | "role" | "at">) => void; onWithdraw: (id: string, reason: string) => void }) {
  const me = useMe();
  const [type, setType] = useState<ScanType | "">("");
  const [docDate, setDocDate] = useState("");
  const [note, setNote] = useState("");
  const [ready, setReady] = useState<Ready | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<{ id: string; reason: string } | null>(null);
  const mine = scans.filter((s) => s.patientId === patient.id).toReversed();
  const left = SCAN_LIMITS.total - totalKept(scans);

  const take = async (f: File) => {
    setProblem(null);
    setReady(null);
    const why = fileProblem(f);
    if (why) return setProblem(why);
    setBusy(true);
    try {
      const original = { name: f.name.slice(0, 120), type: f.type || "image", bytes: f.size };
      if (f.type === "application/pdf") setReady({ dataUrl: await readAsDataUrl(f), mime: "application/pdf", original });
      else {
        const url = URL.createObjectURL(f);
        try {
          const r = await shrink(url);
          setReady({ dataUrl: r.dataUrl, mime: "image/jpeg", width: r.width, height: r.height, original });
        } finally {
          URL.revokeObjectURL(url);
        }
      }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "取り込めませんでした。");
    } finally {
      setBusy(false);
    }
  };
  const makeSample = async () => {
    setProblem(null);
    setBusy(true);
    try {
      const png = sampleImage(patient.name, today);
      const r = await shrink(png);
      setReady({ dataUrl: r.dataUrl, mime: "image/jpeg", width: r.width, height: r.height, original: { name: "架空の見本（紹介状）.png", type: "image/png", bytes: png.length }, sample: true });
      setType("紹介状（他院から）");
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    if (!ready) return;
    const why = formProblem({ type, docDate }) ?? fitProblem(ready.dataUrl.length, scans);
    if (why) return setProblem(why);
    onAdd({ type: type as ScanType, docDate, note: note.trim().slice(0, 200), mime: ready.mime, dataUrl: ready.dataUrl, bytes: ready.dataUrl.length, ...(ready.width ? { width: ready.width, height: ready.height } : {}), original: ready.original, ...(ready.sample ? { sample: true } : {}) });
    setReady(null);
    setType("");
    setDocDate("");
    setNote("");
    setProblem(null);
  };

  return (
    <div className="space-y-3 text-[13px]">
      <p className="rounded-md border border-shu bg-shu-soft px-3 py-1.5 text-[12px]">実在の患者や医療機関の書類・写真は取り込まないでください（この試作は架空の患者だけです）。試すときは「架空の見本を作る」を使えます。</p>
      <section className="space-y-2 rounded-md border border-rule bg-paper p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1 rounded-md border border-rule bg-sheet px-2.5 py-1 hover:border-ai">
            <ImagePlus size={14} />
            ファイルを選ぶ（画像・PDF）
            <input type="file" accept="image/*,application/pdf" className="sr-only" disabled={busy} onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void take(f);
              }}
            />
          </label>
          <button type="button" disabled={busy} onClick={() => void makeSample()} className="flex items-center gap-1 rounded-md border border-dashed border-rule px-2.5 py-1 text-ink-soft hover:border-ai hover:text-ai">
            <Sparkles size={14} />
            架空の見本を作る
          </button>
          {busy && <span className="text-ink-soft">小さくしています…</span>}
        </div>
        <p className="hint text-[12px] text-ink-soft">
          スキャナで PDF か画像にした紙や、タブレットで撮った写真を選びます。画像は長い辺 1,600 画素までの JPEG に小さくして保存します（入らなければさらに小さく）。PDF はそのまま保存するので {kb(SCAN_LIMITS.perFile)} までです。種類と文書の日付を選んで「取り込む」を押します。
        </p>
        {ready && (
          <div className="flex flex-wrap items-start gap-3 rounded border border-rule-soft bg-sheet p-2">
            {ready.mime === "image/jpeg" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ready.dataUrl} alt="取り込む画像の見本" className="max-h-48 rounded border border-rule-soft" />
            ) : (
              <FileText size={48} className="text-ink-soft" />
            )}
            <div className="space-y-1 text-[12px]">
              <div>
                <b>{ready.original.name}</b>
                {ready.sample && <span className="ml-1 rounded border border-dashed border-ink-faint px-1 text-[10px]">架空の見本</span>}
              </div>
              <div className="nums text-ink-soft">
                元 {kb(ready.original.bytes)} → 保存 {kb(ready.dataUrl.length)}
                {ready.width ? `（${ready.width}×${ready.height}）` : "（PDF はそのまま）"}
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">
            種類
            <select value={type} onChange={(e) => setType(e.target.value as ScanType)} className="rounded border border-rule bg-sheet px-1.5 py-0.5">
              <option value="">選ぶ</option>
              {SCAN_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            文書の日付
            <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className="rounded border border-rule bg-sheet px-1.5 py-0.5" />
          </label>
          <label className="flex min-w-48 flex-1 items-center gap-1">
            メモ
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="任意（例：〇〇内科から）" className="min-w-0 flex-1 rounded border border-rule bg-sheet px-1.5 py-0.5" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!ready || busy} onClick={save} className="rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40">
            取り込む（{me.name}）
          </button>
          {problem && <span className="text-yamabuki">{problem}</span>}
          <span className="nums ml-auto text-[11px] text-ink-faint">
            今日の取込の残り {kb(Math.max(0, left))}／{mb(SCAN_LIMITS.total)}
          </span>
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-[12px] font-bold text-ink-soft">取り込んだ文書（{mine.length}件）</h3>
        {mine.length === 0 ? (
          <p className="text-[12px] text-ink-faint">まだありません。</p>
        ) : (
          <ul className="space-y-1.5">
            {mine.map((s) => (
              <li key={s.id} className={`flex flex-wrap items-center gap-2 rounded border border-rule-soft bg-sheet px-2 py-1.5 text-[12px] ${s.withdrawn ? "text-ink-faint" : ""}`}>
                {s.withdrawn ? (
                  <Undo2 size={28} />
                ) : s.mime === "image/jpeg" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.dataUrl} alt={`${s.type}（${s.docDate}）`} className="h-14 w-11 rounded border border-rule-soft object-cover" />
                ) : (
                  <FileText size={28} className="text-ink-soft" />
                )}
                <div className="min-w-0 flex-1">
                  <div>
                    <b>{s.type}</b>　文書の日付 {s.docDate}
                    {s.sample && <span className="ml-1 rounded border border-dashed border-ink-faint px-1 text-[10px]">架空の見本</span>}
                  </div>
                  <div className="nums text-ink-soft">
                    取込 {s.at.time} {s.by}　{s.mime === "application/pdf" ? "PDF" : "画像"} {kb(s.bytes)}
                    {s.note && `　${s.note}`}
                  </div>
                  {s.withdrawn && (
                    <div>
                      取り消し {s.withdrawn.at.time} {s.withdrawn.by}：{s.withdrawn.reason}
                    </div>
                  )}
                </div>
                {!s.withdrawn && (
                  <>
                    <button type="button" onClick={() => openKept(s)} className="flex items-center gap-1 rounded border border-rule px-2 py-0.5 hover:border-ai hover:text-ai">
                      <ExternalLink size={12} />
                      開く
                    </button>
                    {undoing?.id === s.id ? (
                      <span className="flex items-center gap-1">
                        <input value={undoing.reason} onChange={(e) => setUndoing({ id: s.id, reason: e.target.value })} placeholder="取り消す理由" className="w-36 rounded border border-rule bg-paper px-1.5 py-0.5" />
                        <button
                          type="button"
                          disabled={!undoing.reason.trim()}
                          onClick={() => {
                            onWithdraw(s.id, undoing.reason.trim());
                            setUndoing(null);
                          }}
                          className="rounded border border-shu px-2 py-0.5 text-shu disabled:opacity-40"
                        >
                          取り消す
                        </button>
                        <button type="button" onClick={() => setUndoing(null)} className="text-ink-soft">
                          やめる
                        </button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setUndoing({ id: s.id, reason: "" })} className="rounded px-2 py-0.5 text-ink-soft hover:text-shu">
                        取り消す
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[11px] text-ink-faint">取り消しても、取り込んだことと理由は残ります（画像は保存しません）。<span className="hint">取り込んだあとも紙の原本は保管し、取り込んだものは参照用として扱います（架空の病院の取り決め。安全管理ガイドライン システム運用編 16.2）。</span></p>
      </section>
      <Sources items={SCAN_SOURCES} />
    </div>
  );
}
