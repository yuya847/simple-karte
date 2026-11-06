"use client";

// 撮影装置（模擬）: a SIMULATED modality inside the app. It reads the Modality Worklist built from the imaging
// orders (DICOM attributes of PS3.4 Table K.6-1), sends MPPS IN PROGRESS / COMPLETED / DISCONTINUED (Table
// F.7.2-1) that update the order and the 照射録, reports the CT dose as RDSR concepts, and "stores" fictional
// images that then appear in the PACS viewer. No device is connected. A local Orthanc can be used when someone
// runs one (docs/dicom-local.md); on the hosted app that part stays off.

import { displayText } from "@/lib/display-text";
import { MonitorCog } from "lucide-react";
import { useEffect, useState } from "react";
import { auditLog } from "@/lib/audit";
import type { CalendarDate } from "@/lib/dates";
import { ctDoseConcepts, mppsCreate, mppsSet, mwlItem, simulatedAcquisition, toDicomJson, toOrthancTags, worklistFor, type DicomAttr } from "@/lib/dicom-mwl";
import { doneProblems, doseText, putWork, RIS_ROOMS, type RisRow, type RisWork } from "@/lib/ris";
import { Fictional } from "./DeskParts";
import { useDeny, useMe } from "./RoleContext";
import { card, field, RowHead, type OnDesk } from "./RisExam";

function AttrTable({ attrs, depth = 0 }: { attrs: DicomAttr[]; depth?: number }) {
  return (
    <>
      {attrs.map((a) => (
        <tbody key={`${depth}-${a.tag}`}>
          <tr className="border-b border-rule-soft align-top">
            <td className="nums px-1.5 py-0.5 whitespace-nowrap" style={{ paddingLeft: `${0.4 + depth}rem` }}>
              {depth > 0 ? "› " : ""}({a.tag})
            </td>
            <td className="px-1.5 py-0.5">{a.name}</td>
            <td className="px-1.5 py-0.5 text-ink-soft">{a.vr}</td>
            <td className="px-1.5 py-0.5 break-all">{a.vr === "SQ" ? `項目 ${a.items?.length ?? 0}` : a.value || <span className="text-ink-faint">（空）</span>}</td>
            <td className="px-1.5 py-0.5 text-ink-faint">{a.keys ?? ""}</td>
          </tr>
          {a.items?.map((item, i) => (
            <tr key={i}>
              <td colSpan={5} className="p-0">
                <table className="w-full">
                  <AttrTable attrs={item} depth={depth + 1} />
                </table>
              </td>
            </tr>
          ))}
        </tbody>
      ))}
    </>
  );
}

type Local = { enabled: boolean; why?: string; system?: { name: string; version: string }; error?: string };

/** 撮影装置（模擬）. */
export function ModalitySim({ rows, onDesk, nowTime, today }: { rows: RisRow[]; onDesk: OnDesk; nowTime: string; today: CalendarDate }) {
  const me = useMe();
  const deny = useDeny()("ris.exam");
  const [ae, setAe] = useState(RIS_ROOMS[2].ae);
  const [asked, setAsked] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "json" | "orthanc">("table");
  const [stop, setStop] = useState("");
  const [sent, setSent] = useState<{ kind: string; attrs: DicomAttr[] } | null>(null);
  const list = asked === ae ? worklistFor(ae, rows) : [];
  const target = list.find((r) => r.orderId === pick) ?? list[0] ?? null;
  const room = RIS_ROOMS.find((r) => r.ae === ae)!;
  const at = { day: 0, time: nowTime };
  const log = (r: RisRow, what: string) => auditLog({ role: me.role, actor: me.name, action: `確定（撮影装置の模擬：${what}）`, patient: r.name, detail: `${r.label}　${ae}` });
  const put = (r: RisRow, f: (w: RisWork) => RisWork) => onDesk((d) => putWork(d, r, f));
  return (
    <section className="space-y-3">
      <div className={`${card} space-y-2 p-3 text-[12px]`}>
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold">
          <MonitorCog size={16} />
          撮影装置（模擬）
          <Fictional text="模擬：本物の装置にはつないでいません" />
        </h3>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink-soft">装置</span>
          {RIS_ROOMS.map((r) => (
            <button key={r.ae} type="button" onClick={() => setAe(r.ae)} aria-pressed={ae === r.ae} className={`rounded border px-2 py-0.5 ${ae === r.ae ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule"}`}>
              {r.room} · {r.ae}・{r.dicom}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setAsked(ae);
              setPick(null);
              setSent(null);
            }}
            className="ml-auto rounded bg-ai px-2.5 py-0.5 font-bold text-white"
          >
            ワークリストを問い合わせる
          </button>
        </div>
        <p className="text-ink-soft">
          {displayText(room.device)}　AE タイトル {room.ae}　ステーション名 {room.station}
        </p>
      </div>
      {asked === ae && (
        <div className={`${card} p-3 text-[12px]`}>
          <h4 className="mb-1 font-bold">ワークリスト（{ae}・今日・受付済み） {list.length}件</h4>
          {list.length === 0 && <p className="text-ink-faint">この装置に割り当てた受付済みの検査はありません。放射線部の「指示受け」で指示を受け、この装置を選びます。</p>}
          <ul className="flex flex-wrap gap-2">
            {list.map((r) => (
              <li key={r.orderId}>
                <button type="button" onClick={() => (setPick(r.orderId), setSent(null))} className={`rounded border px-2 py-0.5 ${target?.orderId === r.orderId ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule"}`}>
                  {r.work?.slot?.time ?? ""} {r.name} {r.label}（{r.status}）
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {asked === ae && target && (
        <Item key={target.orderId} r={target} view={view} setView={setView} today={today}>
          <div className="flex flex-wrap items-center gap-2">
            {target.status === "受付済み" && (
              <button
                type="button"
                disabled={!!deny}
                onClick={() => {
                  put(target, (w) => ({ ...w, started: { ...at, by: me.name, via: "模擬装置" }, mpps: [...(w.mpps ?? []), { ...at, kind: "N-CREATE", status: "IN PROGRESS", ae }] }));
                  setSent({ kind: "MPPS N-CREATE（IN PROGRESS）", attrs: mppsCreate(target, today, at) });
                  log(target, "MPPS IN PROGRESS");
                }}
                className="rounded bg-ai px-2.5 py-0.5 font-bold text-white disabled:opacity-40"
              >
                検査を始める（MPPS N-CREATE：IN PROGRESS）
              </button>
            )}
            {target.status === "撮影中" && <Finish r={target} ae={ae} today={today} nowTime={nowTime} onDesk={onDesk} onSent={setSent} />}
            {target.status === "撮影中" && (
              <>
                <input value={stop} onChange={(e) => setStop(e.target.value)} placeholder="中止の理由" aria-label="中止の理由" disabled={!!deny} className={`${field} ml-auto w-48`} />
                <button
                  type="button"
                  disabled={!!deny || !stop.trim()}
                  onClick={() => {
                    put(target, (w) => ({ ...w, notDone: { ...at, by: me.name, via: "模擬装置", reason: stop.trim() }, mpps: [...(w.mpps ?? []), { ...at, kind: "N-SET", status: "DISCONTINUED", ae }] }));
                    setSent({ kind: "MPPS N-SET（DISCONTINUED）", attrs: mppsSet(target, today, at, "DISCONTINUED", me.name, 0) });
                    log(target, `MPPS DISCONTINUED（${stop.trim()}）`);
                  }}
                  className="rounded border border-shu px-2 py-0.5 text-shu disabled:opacity-40"
                >
                  中止（MPPS N-SET：DISCONTINUED）
                </button>
              </>
            )}
          </div>
          {target.work?.mpps?.length ? (
            <p className="text-ink-soft">
              送った MPPS：
              {target.work.mpps.map((m) => `${m.time} ${m.kind} ${m.status}`).join("　")}
            </p>
          ) : null}
        </Item>
      )}
      {sent && (
        <div className={`${card} p-3 text-[12px]`}>
          <h4 className="mb-1 font-bold">放射線部に届いた {sent.kind}（模擬）</h4>
          <table className="w-full border-collapse">
            <AttrTable attrs={sent.attrs} />
          </table>
        </div>
      )}
      <Stored rows={rows.filter((r) => r.work?.done && !r.work.images && r.work.room && RIS_ROOMS.find((x) => x.key === r.work!.room)?.ae === ae)} onDesk={onDesk} nowTime={nowTime} ae={ae} />
      <LocalOrthanc target={target} today={today} />



    </section>
  );
}

function Item({ r, view, setView, today, children }: { r: RisRow; view: "table" | "json" | "orthanc"; setView: (v: "table" | "json" | "orthanc") => void; today: CalendarDate; children: React.ReactNode }) {
  const attrs = mwlItem(r, today);
  return (
    <div className={`${card} space-y-2 p-3 text-[12px]`}>
      <RowHead r={r} />
      <div className="flex items-center gap-2">
        <span className="font-bold">ワークリストの項目（MWL）</span>
        {(["table", "json", "orthanc"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={`rounded border px-1.5 text-[11px] ${view === v ? "border-ai bg-ai-soft text-ai" : "border-rule text-ink-soft"}`}>
            {v === "table" ? "表" : v === "json" ? "DICOM JSON" : "Orthanc の形の JSON"}
          </button>
        ))}
      </div>
      {view === "table" ? (
        <div className="scroll-thin max-h-72 overflow-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-rule text-left text-ink-soft">
                <th className="px-1.5 font-normal">タグ</th>
                <th className="px-1.5 font-normal">属性</th>
                <th className="px-1.5 font-normal">VR</th>
                <th className="px-1.5 font-normal">値</th>
                <th className="px-1.5 font-normal">キーの型（照合 / 返答）</th>
              </tr>
            </thead>
            <AttrTable attrs={attrs} />
          </table>
        </div>
      ) : (
        <pre className="scroll-thin max-h-72 overflow-auto rounded bg-paper p-2 text-[11px]">{JSON.stringify(view === "json" ? toDicomJson(attrs) : { Tags: toOrthancTags(attrs) }, null, 2)}</pre>
      )}
      {children}
    </div>
  );
}

function Finish({ r, ae, today, nowTime, onDesk, onSent }: { r: RisRow; ae: string; today: CalendarDate; nowTime: string; onDesk: OnDesk; onSent: (s: { kind: string; attrs: DicomAttr[] }) => void }) {
  const me = useMe();
  const deny = useDeny()("ris.exam");
  const w = r.work!;
  const block = doneProblems(r, w);
  const acq = simulatedAcquisition(r);
  const at = { day: 0, time: nowTime };
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={!!deny || block.length > 0}
        title={block.join(" ") || undefined}
        onClick={() => {
          onDesk((d) =>
            putWork(d, r, (x) => ({
              ...x,
              exposure: { ...acq.exposure, ...x.exposure },
              dose: { ...acq.dose, ...x.dose },
              done: { ...at, by: me.name, via: "模擬装置" },
              mpps: [...(x.mpps ?? []), { ...at, kind: "N-SET", status: "COMPLETED", ae }],
            })),
          );
          onSent({ kind: "MPPS N-SET（COMPLETED）", attrs: mppsSet(r, today, at, "COMPLETED", me.name, acq.series) });
          auditLog({ role: me.role, actor: me.name, action: "確定（撮影装置の模擬：MPPS COMPLETED）", patient: r.name, detail: `${r.label}　${ae}　${doseText(r.order, acq.dose)}` });
        }}
        className="rounded bg-wakatake px-2.5 py-0.5 font-bold text-white disabled:opacity-40"
      >
        撮影を終える（MPPS N-SET：COMPLETED）
      </button>
      <span className="text-ink-soft">
        送る撮影条件と線量（模擬）：{displayText(doseText(r.order, acq.dose))}
        {r.order.modality === "CT" && `　RDSR：${ctDoseConcepts(acq.dose).map((c) => `${c.meaning} (${c.code}, ${c.scheme}) ${c.value} ${c.unit}`).join("・")}`}
      </span>
      {block.length > 0 && <span className="w-full text-shu">{block.join(" ")}</span>}
    </span>
  );
}

function Stored({ rows, onDesk, nowTime, ae }: { rows: RisRow[]; onDesk: OnDesk; nowTime: string; ae: string }) {
  const me = useMe();
  const deny = useDeny()("ris.exam");
  if (rows.length === 0) return null;
  return (
    <div className={`${card} space-y-1 p-3 text-[12px]`}>
      <h4 className="font-bold">PACS へまだ送っていない画像（{ae}）</h4>
      {rows.map((r) => {
        const acq = simulatedAcquisition(r);
        return (
          <p key={r.orderId} className="flex flex-wrap items-center gap-2">
            <span>
              {r.name} {r.label}（撮影 {r.work?.done?.time}）
            </span>
            <button
              type="button"
              disabled={!!deny}
              onClick={() => {
                onDesk((d) => putWork(d, r, (x) => ({ ...x, images: { day: 0, time: nowTime, by: me.name, count: x.exposure?.films ?? acq.images, series: acq.series, via: "模擬装置" } })));
                auditLog({ role: me.role, actor: me.name, action: "確定（撮影装置の模擬：画像を PACS へ送る）", patient: r.name, detail: `${r.label}　${acq.images}枚` });
              }}
              className="rounded border border-ai px-2 py-0.5 text-ai disabled:opacity-40"
            >
              画像を送る（C-STORE の模擬・合成画像 {r.work?.exposure?.films ?? acq.images}枚）
            </button>
          </p>
        );
      })}
    </div>
  );
}

/** 手元の Orthanc（任意。LOCAL_ORTHANC_URL を設定した開発サーバーだけ）. */
function LocalOrthanc({ target, today }: { target: RisRow | null; today: CalendarDate }) {
  const [local, setLocal] = useState<Local | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/dicom")
      .then((r) => r.json())
      .then((j: Local) => live && setLocal(j))
      .catch(() => live && setLocal({ enabled: false, why: "確かめられませんでした。" }));
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className={`${card} space-y-1 p-3 text-[12px]`}>
      <h4 className="font-bold">手元の Orthanc（任意）</h4>
      {!local && <p className="text-ink-faint">確かめています…</p>}

      {local?.enabled && (
        <>
          <p className="text-ink-soft">{displayText(local.system ? `手元の ${local.system.name} ${local.system.version} につながります。` : (local.error ?? ""))}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!target}
              onClick={async () => {
                if (!target) return;
                const res = await fetch("/api/dicom", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ worklist: toOrthancTags(mwlItem(target, today)) }) });
                const j = await res.json().catch(() => ({}));
                setMsg(j.created ? `送りました（Orthanc のワークリスト ID ${j.created.id}）` : (j.error ?? j.why ?? "送れませんでした"));
              }}
              className="rounded border border-ai px-2 py-0.5 text-ai disabled:opacity-40"
            >
              選んだワークリストを手元の Orthanc に送る
            </button>
            <button
              type="button"
              disabled={!target}
              onClick={async () => {
                if (!target) return;
                const j = await fetch(`/api/dicom?patientId=${encodeURIComponent(target.patientId)}`).then((r) => r.json());
                setMsg(j.studies ? `手元の Orthanc にある検査：${j.studies.length}件${j.studies.map((s: { date: string; modalities: string[]; instances: number | null }) => `（${s.date} ${s.modalities.join("・")} ${s.instances ?? "?"}枚）`).join("")}` : (j.error ?? "探せませんでした"));
              }}
              className="rounded border border-ai px-2 py-0.5 text-ai disabled:opacity-40"
            >
              この患者の検査を手元の Orthanc で探す（QIDO-RS）
            </button>
          </div>
          {msg && <p>{msg}</p>}
        </>
      )}

    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >装置を選んで「ワークリストを問い合わせる」を押すと、その装置に割り当てた受付済みの検査が、DICOM のワークリストの形で届きます（C-FIND の応答の模擬）。検査を始める・終える・中止すると MPPS（実施済み手続きの通知）の模擬が放射線部に届き、撮影済みと照射録の撮影条件・線量が入ります。「画像を送る」で合成画像が PACS（カルテの放射線画像）に出ます。</p>
<p >撮影条件・線量・画像の数は、模擬の装置がコードで作る値です（同じオーダなら毎回同じ）。受付番号・Study Instance UID もオーダから作り、生年月日は年齢から作った日付です。</p>
<p >手元のコンピュータで Orthanc を動かして試す方法は、リポジトリの docs/dicom-local.md にあります。Vercel の本番ではつなぎません。</p>
*/
