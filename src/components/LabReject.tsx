"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { REJECT_REASONS, rejectBlock, type DrawRow, type RejectReason } from "@/lib/lab-desk";
import { DenyNote, useDeny } from "./RoleContext";
import { TabChoice } from "./TabChoice";

/**
 * 再採血を依頼: a sample that cannot be measured goes back to the ward (or the ED / outpatient clinic).
 * The technologist chooses why; code makes the new draw with a new label and stops the old one.
 */
export function LabReject({ row, onReject }: { row: DrawRow; onReject: (reason: RejectReason, note: string) => void }) {
  const deny = useDeny()("lab.receive");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<RejectReason | null>(null);
  const [note, setNote] = useState("");
  const block = rejectBlock(row);
  if (block) return null;
  const ready = !!reason && (reason !== "その他" || !!note.trim());
  return (
    <div className="rounded-lg border border-yamabuki/40 bg-sheet px-3 py-2 text-[12px]">
      {!open ? (
        <button type="button" disabled={!!deny} onClick={() => setOpen(true)} className="flex items-center gap-1 rounded border border-yamabuki px-2 py-0.5 font-bold text-yamabuki hover:bg-yamabuki hover:text-white disabled:opacity-40">
          <RotateCcw size={12} />
          測れない検体：再採血を依頼する
        </button>
      ) : (
        <fieldset disabled={!!deny} className="m-0 min-w-0 space-y-1.5 border-0 p-0">
          <legend className="mb-1 flex items-center gap-1 font-bold text-yamabuki">
            <RotateCcw size={13} />
            再採血を依頼する（{row.room} {row.name}さん）
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            <TabChoice label="再採血の理由" options={REJECT_REASONS.map((r) => ({ value: r, label: r }))} value={reason} onChange={setReason} />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={reason === "その他" ? "理由を書く（必須）" : "くわしく（任意）例：強い溶血、1mL"}
              aria-label="再採血の理由（くわしく）"
              className="min-w-0 flex-1 rounded border border-rule bg-paper px-1.5 py-0.5"
            />
          </div>
          <p className="text-[11px] text-ink-soft">依頼すると、このラベル（{row.code}）は二度と受け付けません。同じオーダの採血が新しいラベルで病棟のワークシートに「再採血」として今の時刻で戻り、看護師の指示受けを待ちます（救急外来・外来の検体は受付の一覧に戻ります）。</p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={!ready} onClick={() => onReject(reason!, note)} className="rounded bg-yamabuki px-3 py-1 font-bold text-white disabled:opacity-40">
              再採血を依頼
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-ink-soft hover:text-ink">
              やめる
            </button>
          </div>
        </fieldset>
      )}
      <DenyNote action="lab.receive" className="mt-1" />
    </div>
  );
}
