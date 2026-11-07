"use client";

import { BadgeCheck, KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { DischargeDraft } from "@/lib/discharge";
import { deviceKeys as keys, ESIGN_SOURCES, nowStamp, signDoc, signedContent, verificationText, verifyDoc, type SignedKind, type SignRecord } from "@/lib/esign";
import { Sources } from "../DeskParts";
import { DenyNote, useDeny, useMe } from "../RoleContext";

const KINDS: SignedKind[] = ["退院時サマリー", "診療情報提供書"];

/**
 * 電子署名（模擬）under the 退院サマリ panel: the confirmed summary (and the letter the old 退院サマリ issued) is
 * signed with a key made in this browser, and each signature is checked against the document as it is now. A
 * 紹介状 of the letter tool is signed in that tool.
 */
export function SignBox({ patientId, draft, records, onSigned, newId }: { patientId: string; draft?: DischargeDraft; records: SignRecord[]; onSigned: (r: SignRecord) => void; newId: () => string }) {
  const me = useMe();
  const deny = useDeny()("discharge");
  const [busy, setBusy] = useState<SignedKind | null>(null);
  const [checks, setChecks] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);

  const sign = async (kind: SignedKind) => {
    const doc = signedContent(kind, draft);
    if (!doc) return;
    setBusy(kind);
    setProblem(null);
    try {
      onSigned(await signDoc(keys(), { id: newId(), kind, patientId, doc, signer: me.name, role: me.role, at: nowStamp() }));
    } catch {
      setProblem("署名できませんでした（このブラウザで鍵を作れないか、保存できません）。");
    } finally {
      setBusy(null);
    }
  };
  const check = async (r: SignRecord) => {
    const now = signedContent(r.kind, draft);
    const v = await verifyDoc(keys(), r, now ?? {});
    setChecks((c) => ({ ...c, [r.id]: verificationText(v) }));
  };

  return (
    <section aria-label="電子署名（模擬）" className="mt-4 space-y-2 rounded-md border border-rule bg-paper p-3 text-[12px]">
      <h3 className="flex items-center gap-1.5 text-[13px] font-bold">
        <ShieldCheck size={15} className="text-ai" />
        電子署名
        <span className="rounded border border-dashed border-ink-faint px-1.5 py-0.5 text-[10px] font-normal text-ink-soft">模擬</span>
      </h3>


      {KINDS.map((kind) => {
        const ready = !!signedContent(kind, draft);
        const mine = records.filter((r) => r.patientId === patientId && r.kind === kind);
        if (kind === "診療情報提供書" && !ready && !mine.length) return null;
        return (
          <div key={kind} className="rounded border border-rule-soft bg-sheet p-2">
            <div className="flex flex-wrap items-center gap-2">
              <b>{kind}</b>
              <span className="text-ink-soft">{ready ? (kind === "退院時サマリー" ? "確定済み" : "発行済み") : kind === "退院時サマリー" ? "まだ確定していません" : "まだ発行していません"}</span>
              <button type="button" disabled={!ready || !!deny || busy !== null} onClick={() => void sign(kind)} className="ml-auto flex items-center gap-1 rounded-md bg-ai px-3 py-0.5 font-bold text-white disabled:opacity-40">
                <KeyRound size={13} />
                {busy === kind ? "署名しています…" : `電子署名する（模擬・${me.name}）`}
              </button>
            </div>
            {mine.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {mine.map((r) => (
                  <li key={r.id} className="nums rounded bg-paper px-2 py-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span>
                        署名 {r.at.date} {r.at.time}
                      </span>
                      <span>{r.signer}</span>
                      <span className="text-ink-soft">鍵の指紋 {r.keyId.slice(0, 8)}…</span>
                      <button type="button" onClick={() => void check(r)} className="ml-auto flex items-center gap-1 rounded border border-rule px-2 py-0.5 hover:border-ai hover:text-ai">
                        <BadgeCheck size={12} />
                        確かめる
                      </button>
                    </div>
                    <div className="break-all text-[11px] text-ink-faint">署名 {r.signature.slice(0, 48)}…　文書のハッシュ（SHA-256）{r.docHash.slice(0, 16)}…</div>
                    {checks[r.id] && <div className="mt-0.5 text-ink">{checks[r.id]}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {problem && <p className="text-yamabuki">{problem}</p>}
      <DenyNote action="discharge" />
      <Sources items={ESIGN_SOURCES} />
    </section>
  );
}

/* Help migration source (references and dynamic wording):
<p >確定した退院時サマリーと、発行した診療情報提供書に署名できます。「確かめる」で、いまの文書が署名したときと同じか、署名がこの端末の鍵と合うかを調べます。</p>
*/

/* ヘルプへ移動した説明:
模擬の電子署名です。鍵はこの端末のブラウザの中で作り（ ）、秘密鍵は取り出せない形でこのブラウザに置いたまま、外へは出しません。記録に残すのは署名と文書のハッシュと鍵の指紋だけです。法令で医師の記名・押印が求められる文書を電子署名で代えるには、HPKI（保健医療福祉分野の公開鍵基盤）の認証局が発行する電子証明書などで署名し、長く確かめられるように認定事業者のタイムスタンプを付けます。この署名はそのどちらでもなく、時刻はこの端末の時計なので、法的な署名にはなりません。
*/
