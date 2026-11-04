"use client";

import { ExecutionUndo } from "./ExecutionUndo";
import { cancelExecution } from "@/lib/mar";

// 放射線部: the technologist's record of a study (照射の方法・線量・造影剤 → 撮影済み → 照射録), the ordering
// doctor's signature, and the radiologist's reading report. What is missing is worked out in ris.ts.

import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import {
  contrastFor,
  doneProblems,
  doseText,
  drlFor,
  findRoom,
  irradiates,
  needsReading,
  orderConsentText,
  putWork,
  recordProblems,
  reportProblems,
  reportVersion,
  RIS_RULES,
  shoshaRoku,
  type RisContrast,
  type RisDesk,
  type RisDose,
  type RisExposure,
  type RisRow,
  type RisWork,
} from "@/lib/ris";
import { imagingMethodText } from "@/lib/format";
import { useDeny, useMe } from "./RoleContext";

export const card = "rounded-lg border border-rule bg-sheet";
export const field = "rounded border border-rule bg-paper px-1.5 py-0.5 outline-none focus:border-ai";

export const whenText = (a: number) => {
  const d = Math.floor(a / 1440);
  const m = a - d * 1440;
  const t = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `${d === 0 ? "今日" : d === 1 ? "明日" : d === -1 ? "昨日" : d < 0 ? `${-d}日前` : `${d}日後`} ${t}`;
};

export const dayFmt = (today: CalendarDate) => (d: number) => `${formatShort(addDays(today, d))}`;

export type OnDesk = (f: (d: RisDesk) => RisDesk) => void;

export const STATUS_TONE: Record<RisRow["status"], string> = { 依頼: "text-ink-soft", 受付済み: "font-bold text-ai", 撮影中: "font-bold text-fuji", 撮影済み: "font-bold text-yamabuki", 読影済み: "text-wakatake", 中止: "font-bold text-shu" };

export function RowHead({ r }: { r: RisRow }) {
  const room = findRoom(r.work?.room);
  return (
    <header className="flex flex-wrap items-baseline gap-x-3">
      <span className="nums">
        {whenText(r.at)}
        {r.order.when.priority === "至急" && <span className="ml-1 rounded bg-shu px-1 text-[10px] font-bold text-white">至急</span>}
      </span>
      <b>
        {r.room}　{r.name}
      </b>
      <span className="font-bold">{r.label}</span>
      {imagingMethodText(r.order) && <span>{imagingMethodText(r.order)}</span>}
      {orderConsentText(r.order) && <span className={r.order.consent?.state === "取得済み" ? "text-wakatake" : "font-bold text-shu"}>{orderConsentText(r.order)}</span>}
      <span className="text-ink-soft">
        {r.order.transport}　目的：{r.order.purpose}　{r.orderedBy}
        {room ? `　${room.room}（${room.ae}）` : ""}
      </span>
      <span className={STATUS_TONE[r.status]}>{r.status}</span>
    </header>
  );
}

const num = (s: string | undefined) => (s === undefined || s.trim() === "" ? undefined : Number(s));
const str = (v: number | undefined) => (v === undefined ? "" : String(v));

/** 撮影の記録：照射の方法・線量・造影剤、撮影済み、照射録の確定。 */
export function ExamForm({ r, onDesk, nowTime, today }: { r: RisRow; onDesk: OnDesk; nowTime: string; today: CalendarDate }) {
  const me = useMe();
  const deny = useDeny()("ris.exam");
  const w: RisWork = r.work ?? { orderId: r.orderId, patientId: r.patientId, label: r.label };
  const [ex, setEx] = useState<Record<string, string>>(() => ({
    kv: str(w.exposure?.kv),
    mas: str(w.exposure?.mas),
    distanceCm: str(w.exposure?.distanceCm),
    ma: str(w.exposure?.ma),
    rotationSec: str(w.exposure?.rotationSec),
    sliceMm: str(w.exposure?.sliceMm),
    range: w.exposure?.range ?? "",
    sequences: w.exposure?.sequences ?? "",
    films: str(w.exposure?.films ?? (r.order.views?.length || undefined)),
    ctdiVol: str(w.dose?.ctdiVol),
    dlp: str(w.dose?.dlp),
    esak: str(w.dose?.esak),
  }));
  const products = contrastFor(r.order.modality);
  const [ct, setCt] = useState<{ code: string; count: string; lot: string; reaction: RisContrast["reaction"]; note: string }>(() => ({ code: w.contrast?.code ?? "", count: str(w.contrast?.count ?? 1), lot: w.contrast?.lot ?? "", reaction: w.contrast?.reaction ?? "なし", note: w.contrast?.reactionNote ?? "" }));
  const [stopReason, setStopReason] = useState("");
  const at = { day: 0, time: nowTime };
  const fmt = dayFmt(today);
  const exposure: RisExposure = {
    kv: num(ex.kv),
    mas: num(ex.mas),
    distanceCm: num(ex.distanceCm),
    ma: num(ex.ma),
    rotationSec: num(ex.rotationSec),
    sliceMm: num(ex.sliceMm),
    range: ex.range.trim() || undefined,
    sequences: ex.sequences.trim() || undefined,
    films: num(ex.films),
  };
  const dose: RisDose = { ctdiVol: num(ex.ctdiVol), dlp: num(ex.dlp), esak: num(ex.esak) };
  const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && !Number.isNaN(v))) as T;
  const put = (f: (x: RisWork) => RisWork) => onDesk((d) => putWork(d, r, f));
  const log = (what: string, detail = "") => auditLog({ role: me.role, actor: me.name, action: `確定（放射線部：${what}）`, patient: r.name, detail: `${r.label}${detail}` });
  const saveConditions = () => {
    put((x) => ({ ...x, exposure: clean(exposure), dose: clean(dose) }));
    log("撮影条件・線量を記録", `　${doseText(r.order, clean(dose))}`);
  };
  const product = products.find((p) => p.code === ct.code);
  const saveContrast = () => {
    if (!product) return;
    const c: RisContrast = { ...at, by: me.name, code: product.code, name: product.name, count: Number(ct.count) || 1, route: "静注", lot: ct.lot.trim(), reaction: ct.reaction, ...(ct.reaction === "あり" ? { reactionNote: ct.note.trim() } : {}) };
    put((x) => ({ ...x, contrast: c }));
    log("造影剤を記録", `　${c.name} ${c.count}${product.unit}　ロット ${c.lot || "（未記入）"}　副作用 ${c.reaction}${c.reactionNote ? `：${c.reactionNote}` : ""}`);
  };
  const preview: RisRow = { ...r, work: { ...w, exposure: clean(exposure), dose: clean(dose) } };
  const blockDone = doneProblems(r, w);
  const recProblems = recordProblems(r, fmt);
  const s = irradiates(r.order.modality) ? shoshaRoku(preview, fmt) : null;
  const { drl, why } = drlFor(r.order, preview.work);
  const isXray = r.order.modality === "X線" || r.order.modality === "ポータブルX線";
  const isCt = r.order.modality === "CT";
  const input = (k: string, label: string, unit: string, wide = false) => (
    <label key={k} className="flex items-center gap-1">
      <span className="text-ink-soft">{label}</span>
      <input value={ex[k] ?? ""} onChange={(e) => setEx({ ...ex, [k]: e.target.value })} inputMode={wide ? undefined : "decimal"} aria-label={label} disabled={!!deny || !!w.record} className={`${field} nums ${wide ? "w-40" : "w-16 text-right"}`} />
      {unit && <span className="text-ink-soft">{unit}</span>}
    </label>
  );
  return (
    <article className={`${card} space-y-2 p-3 text-[12px]`}>
      <RowHead r={r} />
      {(w.done || w.started || w.arrived) && <ExecutionUndo action="ris.exam" patient={r.name} detail={r.label} onUndo={(by, at, reason) => put((x) => cancelExecution(x, ["arrived", "confirmed", "called", "inRoom", "started", "done", "images", "record", "signed", "report", "contrast", "dose", "exposure"], by, at, reason))} />}
      {w.cancellations?.map((c, i) => <span key={i} className="hint" title={`${c.at} ${c.by} ${c.reason}`}>撮影・受付の取り消し {c.at} {c.by} {c.reason}</span>)}
      {(r.order.acks?.length || r.order.answers) && (
        <p className="text-ink-soft">
          オーダの確認：{[...(r.order.acks ?? []), r.order.answers?.metal && `体内金属 ${r.order.answers.metal}`, r.order.answers?.pregnancy && `妊娠 ${r.order.answers.pregnancy}`].filter(Boolean).join("・")}
          {r.allergies.length > 0 && <b className="ml-2 text-shu">アレルギー：{r.allergies.join("、")}</b>}
        </p>
      )}
      <fieldset className="space-y-1">
        <legend className="font-bold">照射の方法{r.order.modality === "MRI" ? "（MRI：撮像の内容）" : ""}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {isXray && [input("kv", "管電圧", "kV"), input("mas", "管電流時間積", "mAs"), input("distanceCm", "撮影距離", "cm"), input("films", "枚数", "枚")]}
          {isCt && [input("kv", "管電圧", "kV"), input("ma", "管電流", "mA"), input("rotationSec", "回転時間", "秒"), input("sliceMm", "スライス厚", "mm"), input("range", "撮影範囲", "", true)]}
          {r.order.modality === "MRI" && input("sequences", "撮像", "", true)}
        </div>
        {irradiates(r.order.modality) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-bold">線量</span>
            {isCt ? [input("ctdiVol", "CTDIvol", "mGy"), input("dlp", "DLP", "mGy・cm")] : input("esak", "正面1枚の入射表面空気カーマ", "mGy")}
            <span className="text-ink-soft">{drl ? `DRL（${drl.protocol}）：${drl.ctdiVol !== undefined ? `CTDIvol ${drl.ctdiVol} mGy・DLP ${drl.dlp} mGy・cm` : `${drl.esak} mGy`}` : why}</span>
          </div>
        )}
        <button type="button" disabled={!!deny || !!w.record} onClick={saveConditions} className="rounded border border-ai px-2 py-0.5 text-ai disabled:opacity-40">
          撮影条件と線量を記録
        </button>
      </fieldset>
      {(r.order.contrast && r.order.contrast !== "単純") || w.contrast ? (
        <fieldset className="space-y-1">
          <legend className="font-bold">造影剤</legend>
          <div className="flex flex-wrap items-center gap-2">
            <select value={ct.code} onChange={(e) => setCt({ ...ct, code: e.target.value })} aria-label="造影剤" disabled={!!deny || !!w.record} className={field}>
              <option value="">採用品から選ぶ</option>
              {products.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1">
              <input value={ct.count} onChange={(e) => setCt({ ...ct, count: e.target.value })} inputMode="numeric" aria-label="本数" disabled={!!deny || !!w.record} className={`${field} nums w-10 text-right`} />
              {product?.unit ?? "本"}
            </label>
            <input value={ct.lot} onChange={(e) => setCt({ ...ct, lot: e.target.value })} placeholder="ロット番号" aria-label="ロット番号" disabled={!!deny || !!w.record} className={`${field} w-28`} />
            <span className="text-ink-soft">副作用</span>
            {(["なし", "あり"] as const).map((v) => (
              <label key={v} className="flex items-center gap-0.5">
                <input type="radio" name={`reaction-${r.orderId}`} checked={ct.reaction === v} onChange={() => setCt({ ...ct, reaction: v })} disabled={!!deny || !!w.record} className="accent-ai" />
                {v}
              </label>
            ))}
            {ct.reaction === "あり" && <input value={ct.note} onChange={(e) => setCt({ ...ct, note: e.target.value })} placeholder="内容と対応（例：膨疹、医師に報告）" aria-label="副作用の内容" disabled={!!deny || !!w.record} className={`${field} w-64`} />}
            <button type="button" disabled={!!deny || !product || !!w.record} onClick={saveContrast} className="rounded border border-ai px-2 py-0.5 text-ai disabled:opacity-40">
              造影剤を記録
            </button>
          </div>
          {w.contrast && (
            <p className="text-ink-soft">
              記録：{w.contrast.name} {w.contrast.count}（{w.contrast.time} {w.contrast.by}）　副作用 {w.contrast.reaction}
              {w.contrast.reactionNote ? `：${w.contrast.reactionNote}` : ""}
            </p>
          )}
          <p className="text-[11px] text-ink-faint">{RIS_RULES.contrast}</p>
        </fieldset>
      ) : null}
      {!w.done && !w.notDone && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!!deny || blockDone.length > 0}
            onClick={() => {
              put((x) => ({ ...x, exposure: clean(exposure), dose: clean(dose), ...(x.started ? {} : { started: { ...at, by: me.name, via: "手入力" as const } }), done: { ...at, by: me.name, via: "手入力" } }));
              log("撮影済み（手入力）");
            }}
            className="rounded bg-wakatake px-2.5 py-0.5 font-bold text-white disabled:opacity-40"
          >
            撮影済みにする（手入力）
          </button>
          {(deny || blockDone.length > 0) && <span className="text-xs text-ink-soft">{deny ?? blockDone.join("　")}</span>}
          <input value={stopReason} onChange={(e) => setStopReason(e.target.value)} placeholder="撮影できなかった理由" aria-label="撮影できなかった理由" disabled={!!deny} className={`${field} ml-auto w-56`} />
          <button
            type="button"
            disabled={!!deny || !stopReason.trim()}
            onClick={() => {
              put((x) => ({ ...x, notDone: { ...at, by: me.name, via: "手入力", reason: stopReason.trim() } }));
              log("中止（撮影できなかった）", `　${stopReason.trim()}`);
            }}
            className="rounded border border-shu px-2 py-0.5 text-shu disabled:opacity-40"
          >
            撮影できなかった
          </button>
          {blockDone.length > 0 && (
            <ul className="w-full list-disc pl-5 text-ink-soft">
              {blockDone.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {w.done && (
        <p className="text-ink-soft">
          撮影済み {w.done.time} {w.done.by}（{w.done.via}）
          {w.images ? `　画像 ${w.images.count}枚を PACS へ送った（${w.images.time}・${w.images.via}）` : "　画像はまだ PACS へ送っていません"}
        </p>
      )}
      {s && (
        <section className="rounded border border-rule-soft bg-paper p-2">
          <h4 className="font-bold">照射録（診療放射線技師法施行規則 第16条の事項）</h4>
          <dl className="grid grid-cols-[minmax(0,16rem)_1fr] gap-x-3 gap-y-0.5">
            {s.items.map((i) => (
              <div key={i.label} className="contents">
                <dt className="text-ink-soft">{i.label}</dt>
                <dd>
                  {i.value}
                  {i.missing.length > 0 && <span className="ml-1 text-shu">（未記入：{i.missing.join("・")}）</span>}
                </dd>
              </div>
            ))}
            <dt className="text-ink-soft">線量</dt>
            <dd>
              {doseText(r.order, preview.work?.dose)}
              {s.doseMissing.length > 0 && <span className="ml-1 text-shu">（未記入：{s.doseMissing.join("・")}）</span>}
            </dd>
            <dt className="text-ink-soft">指示をした医師の署名（法 第28条）</dt>
            <dd>{w.signed ? `${w.signed.by}（${fmt(w.signed.day)} ${w.signed.time}）` : "まだ"}</dd>
          </dl>
          {w.record ? (
            <p className="mt-1 text-wakatake">
              照射録を確定 {w.record.time} {w.record.by}
            </p>
          ) : (
            <>
              {recProblems.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-ink-soft">
                  {recProblems.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                disabled={!!deny || !w.done || recProblems.length > 0}
                onClick={() => {
                  put((x) => ({ ...x, record: { ...at, by: me.name } }));
                  log("照射録を確定");
                }}
                className="mt-1 rounded bg-ai px-2.5 py-0.5 font-bold text-white disabled:opacity-40"
              >
                照射録を確定
              </button>
              {(deny || !w.done || recProblems.length > 0) && <span className="ml-2 text-xs text-ink-soft">{deny ?? (!w.done ? "撮影済みの記録がまだです。" : recProblems.join("　"))}</span>}
              <span className="hint ml-2 text-[11px] text-ink-faint">撮影した記録を入れてから確定します。確定すると、指示をした医師に署名を頼みます（カルテの放射線画像にも出ます）。</span>
            </>
          )}
        </section>
      )}
      {!s && <p className="text-[11px] text-ink-faint">MRI は放射線を照射しないので、照射録の対象ではありません。</p>}
    </article>
  );
}

/** 照射録の署名（指示をした医師だけが押せる）. */
export function SignButton({ r, onDesk, nowTime }: { r: RisRow; onDesk: OnDesk; nowTime: string }) {
  const me = useMe();
  const deny = useDeny()("ris.sign");
  const w = r.work;
  if (!w?.record) return <span className="text-ink-faint">—</span>;
  if (w.signed) return <span className="text-wakatake">署名 {w.signed.time} {w.signed.by}</span>;
  const other = !deny && me.name !== r.orderedBy ? `指示をした医師（${r.orderedBy}）が署名します。` : null;
  return (
    <button
      type="button"
      disabled={!!deny || !!other}
      title={deny ?? other ?? undefined}
      onClick={() => {
        onDesk((d) => putWork(d, r, (x) => ({ ...x, signed: { day: 0, time: nowTime, by: me.name } })));
        auditLog({ role: me.role, actor: me.name, action: "確定（照射録に署名）", patient: r.name, detail: r.label });
      }}
      className="rounded border border-ai px-1.5 text-[11px] text-ai disabled:opacity-40"
    >
      照射録に署名
    </button>
  );
}

/** 読影レポート（放射線科医）. */
export function ReadingForm({ r, onDesk, nowTime }: { r: RisRow; onDesk: OnDesk; nowTime: string }) {
  const me = useMe();
  const deny = useDeny()("ris.report");
  const w = r.work!;
  const prev = w.report;
  const [findings, setFindings] = useState(prev?.findings ?? "");
  const [impression, setImpression] = useState(prev?.impression ?? "");
  const [reason, setReason] = useState("");
  const problems = reportProblems({ findings, impression, reason }, !!prev);
  const confirm = () => {
    if (problems.length) return;
    const rep = { day: 0, time: nowTime, by: me.name, findings: findings.trim(), impression: impression.trim(), ...(prev ? { reason: reason.trim() } : {}) };
    onDesk((d) => putWork(d, r, (x) => ({ ...x, report: rep, ...(x.report ? { earlier: [...(x.earlier ?? []), x.report] } : {}) })));
    auditLog({ role: me.role, actor: me.name, action: prev ? "確定（読影レポートを訂正）" : "確定（読影レポート）", patient: r.name, detail: `${r.label}　${impression.trim().slice(0, 60)}` });
  };
  return (
    <article className={`${card} space-y-2 p-3 text-[12px]`}>
      <RowHead r={r} />
      <p className="text-ink-soft">
        撮影 {w.done?.time} {w.done?.by}　画像 {w.images?.count ?? 0}枚
        {prev && `　いまの版：第${reportVersion(w)}版（${prev.time} ${prev.by}）`}
        {!needsReading(r.order) && "　（読影不要のオーダ）"}
      </p>
      <label className="block">
        所見
        <textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={4} className={`${field} block w-full`} disabled={!!deny} />
      </label>
      <label className="block">
        診断（まとめ。医師の「未確認の結果」に出る）
        <input value={impression} onChange={(e) => setImpression(e.target.value)} className={`${field} block w-full`} disabled={!!deny} />
      </label>
      {prev && <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="訂正の理由" aria-label="訂正の理由" className={`${field} w-full`} disabled={!!deny} />}
      {problems.length > 0 && (
        <ul className="list-disc pl-5 text-ink-soft">
          {problems.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <button type="button" disabled={!!deny || problems.length > 0} onClick={confirm} className="rounded bg-ai px-3 py-0.5 font-bold text-white disabled:opacity-40">
        {prev ? "訂正を確定" : "読影レポートを確定"}
      </button>
      <span className="hint ml-2 text-[11px] text-ink-faint">画像はカルテの「放射線画像」（PACS ビューア）で見られます。所見と診断は放射線科医が書きます。コードは所見を書きません。</span>
    </article>
  );
}
