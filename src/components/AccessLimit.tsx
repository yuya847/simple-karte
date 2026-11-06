"use client";

import { displayText } from "@/lib/display-text";
import { LockKeyhole } from "lucide-react";
import { useState } from "react";
import { GLASS_REASONS, LIMIT_KINDS, LIMIT_RULES, LIMIT_SOURCES, glassProblem, glassText, limitProblem, type AccessLimit, type GlassEntry, type GlassReason, type LimitKind, careTeam } from "@/lib/access-limit";

// 閲覧制限: the step that asks for a reason before a limited chart opens, the line on the chart, and the
// panel where a doctor sets or removes the limit.

function Sources() {
  return (
    <ul className="hint list-disc space-y-0.5 pl-5 text-[11px] text-ink-soft">
      {Object.values(LIMIT_SOURCES).map((s) => (
        <li key={s.label}>
          <a href={s.url} target="_blank" rel="noreferrer" className="text-ai underline-offset-2 hover:underline">
            {s.label}
          </a>
        </li>
      ))}
      {Object.values(LIMIT_RULES).map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

/** Before a limited chart opens for someone outside the care team: choose a reason (and write more). */
export function GlassStep({ patient, me, onOpen, onBack }: { patient: { name: string; room: string; attending: string }; me: string; onOpen: (reason: GlassReason, note: string) => void; onBack: () => void }) {
  const [reason, setReason] = useState<GlassReason | "">("");
  const [note, setNote] = useState("");
  const problem = glassProblem(reason, note);
  const team = careTeam(patient);
  return (
    <main className="grid flex-1 place-items-start justify-center overflow-y-auto bg-paper px-4 py-8 text-[13px]">
      <section role="dialog" aria-label="閲覧制限の患者を開く理由" className="w-[min(560px,100%)] rounded-lg border border-fuji/40 bg-sheet p-5 shadow-[0_12px_32px_-8px_rgba(38,34,28,0.25)]">
        <h1 className="mb-1 flex items-center gap-2 text-base font-bold text-fuji">
          <LockKeyhole size={18} />
          閲覧制限の患者です
        </h1>
        <p className="mb-3 text-ink-soft">
          <b className="text-ink">
            {patient.room} {patient.name}
          </b>
          さんのカルテは、担当チームのほかの人は理由を残してから開きます。開いたことは監査ログに残り、あとで確かめます。
        </p>
        <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded bg-fuji-soft/60 px-3 py-2 text-[12px]">
          <dt className="text-ink-faint">担当チーム</dt>
          <dd>
            主治医 {team.attending}（とそのチームの医師）・受け持ち看護師 {displayText(team.nurse)}
            {team.nurseTeam ? `・${team.nurseTeam}を選んだ看護師` : ""}
          </dd>
          <dt className="text-ink-faint">いま</dt>
          <dd>{me}（担当チームではありません）</dd>
        </dl>
        <fieldset className="mb-2">
          <legend className="mb-1 font-bold">開く理由</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {GLASS_REASONS.map((r) => (
              <label key={r} className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 pointer-coarse:py-2 ${reason === r ? "border-fuji bg-fuji-soft" : "border-rule"}`}>
                <input type="radio" name="glass-reason" checked={reason === r} onChange={() => setReason(r)} className="accent-fuji" />
                {r}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mb-3 block">
          <span className="mb-0.5 block text-[12px] text-ink-soft">くわしく（{reason === "その他" ? "必須" : "任意"}。例：夜間の発熱で病棟から呼ばれた）</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded border border-rule bg-paper px-2 py-1" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!!problem} onClick={() => reason && onOpen(reason, note)} className="rounded bg-fuji px-3 py-1 font-bold text-white disabled:opacity-40">
            理由を残して開く
          </button>
          <button type="button" onClick={onBack} className="rounded border border-rule px-3 py-1 text-ink-soft hover:bg-paper">
            開かずに戻る
          </button>
          {problem && <span className="text-[12px] text-ink-faint">{problem}</span>}
        </div>
        <div className="mt-4 border-t border-rule-soft pt-2">
          <Sources />
        </div>
      </section>
    </main>
  );
}

/** On the chart of a limited patient: the limit, and how this person came in. */
export function LimitStrip({ limit, inTeam, grant, fmtDay }: { limit: AccessLimit; inTeam: boolean; grant?: GlassEntry; fmtDay: (d: number) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-rule bg-fuji-soft/70 px-4 py-1 text-[12px]">
      <b className="flex items-center gap-1 text-fuji">
        <LockKeyhole size={13} />
        閲覧制限（{limit.kind ?? "その他"}）
      </b>
      <span className="text-ink-soft">
        設定 {displayText(limit.by)} {fmtDay(limit.at.day)} {limit.at.time}
      </span>
      <span className="text-ink-soft">{displayText(inTeam ? "担当チームとして開いています。" : grant ? `理由を残して開いています（${grant.at.time} ${glassText(grant)}）。` : "")}開いた記録は監査ログに残ります。</span>
    </div>
  );
}

/** The panel: set or remove the limit, with a reason; every version is listed. */
export function LimitPanel({ history, current, fmtDay, onSave }: { history: AccessLimit[]; current: AccessLimit | null; fmtDay: (d: number) => string; onSave: (on: boolean, kind: LimitKind | undefined, reason: string) => void }) {
  const [kind, setKind] = useState<LimitKind | "">("");
  const [reason, setReason] = useState("");
  const on = !current;
  const problem = limitProblem(on, kind, reason);
  return (
    <div className="space-y-3 text-[13px]">
      <p className="text-ink-soft">
        閲覧制限にした患者のカルテは、担当チームのほかの人が開くとき、理由を残してから開きます（一覧には「閲覧制限」の印が付きます）。開いた記録は監査ログの「カルテを開いた記録」で、患者・人・日付で絞って CSV（comma-separated values、カンマ区切りの表）に書き出せます。
      </p>
      <p className={`rounded px-2 py-1 ${current ? "bg-fuji-soft text-fuji" : "bg-paper text-ink-soft"}`}>
        いま：{displayText(current ? `閲覧制限（${current.kind ?? "その他"}）　${current.by} ${fmtDay(current.at.day)} ${current.at.time}` : "閲覧制限なし")}
      </p>
      {on && (
        <fieldset>
          <legend className="mb-1 font-bold">区分</legend>
          <div className="flex flex-wrap gap-1">
            {LIMIT_KINDS.map((k) => (
              <label key={k} className={`flex cursor-pointer items-center gap-1 rounded border px-2 py-0.5 ${kind === k ? "border-fuji bg-fuji-soft" : "border-rule"}`}>
                <input type="radio" name="limit-kind" checked={kind === k} onChange={() => setKind(k)} className="accent-fuji" />
                {k}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="block">
        <span className="mb-0.5 block font-bold">{on ? "閲覧制限にする理由" : "外す理由"}</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder={on ? "例：当院の職員。本人の希望" : "例：本人から制限は不要と申し出があった"} className="w-full rounded border border-rule bg-paper px-2 py-1" />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!!problem}
          onClick={() => {
            onSave(on, on && kind ? kind : undefined, reason.trim());
            setReason("");
            setKind("");
          }}
          className="rounded bg-fuji px-3 py-1 font-bold text-white disabled:opacity-40"
        >
          {on ? "閲覧制限にする" : "閲覧制限を外す"}
        </button>
        {problem && <span className="text-[12px] text-ink-faint">{problem}</span>}
      </div>
      {history.length > 0 && (
        <section>
          <h3 className="mb-1 font-bold">これまでの設定</h3>
          <ol className="space-y-0.5 text-[12px]">
            {history.toReversed().map((h) => (
              <li key={h.id} className="border-t border-rule-soft pt-0.5">
                <span className="nums text-ink-faint">
                  {fmtDay(h.at.day)} {h.at.time}
                </span>{" "}
                <b className={h.on ? "text-fuji" : "text-ink-soft"}>{h.on ? `設定（${h.kind ?? "その他"}）` : "解除"}</b> {displayText(h.by)}：{displayText(h.reason)}
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="border-t border-rule-soft pt-2">
        <Sources />
      </div>
    </div>
  );
}
