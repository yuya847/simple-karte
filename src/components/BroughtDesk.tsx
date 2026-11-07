"use client";

import { displayText } from "@/lib/display-text";
import { broughtLines, type BroughtInput } from "@/lib/brought-history";
import { matchOral, type BroughtReport, type BroughtRow } from "@/lib/pharmacy";
import { useWindowEntry } from "@/lib/window-entry";
import { BroughtLinesTable } from "./BroughtParts";
import { NotebookCapture, type KeptPage, type PhotoRead } from "./NotebookCapture";
import { useMe } from "./RoleContext";

const STATUS: Record<BroughtReport["status"], string> = { 鑑別中: "薬剤師の確認待ち", 医師へ報告: "医師の判断待ち", 指示の下書き: "指示の下書き", 指示済: "指示済" };

/**
 * 持参薬 for the nurse and the doctor (at admission): the same お薬手帳 photos and boxes as the pharmacist's
 * 持参薬鑑別, read into rows and handed to the pharmacist as a draft. The pharmacist checks them against the
 * drugs brought in (確定), and the doctor chooses for each drug; neither is done here.
 */
export function BroughtDesk({ patientId, reports, onPhotos, onDraft, onOpenPhoto }: { patientId: string; reports: BroughtReport[]; onPhotos: (pages: KeptPage[]) => string[]; onDraft: (r: BroughtInput) => void; onOpenPhoto: (scanId: string) => void }) {
  const me = useMe();
  const scope = `${patientId}:${me.role}`;
  const [rows, setRows] = useWindowEntry<BroughtRow[]>("brought-desk-rows", [], scope);
  const [scanIds, setScanIds] = useWindowEntry<string[]>("brought-desk-scans", [], scope);
  const [notRead, setNotRead] = useWindowEntry<PhotoRead["notRead"]>("brought-desk-not-read", [], scope);
  const [draftId, setDraftId] = useWindowEntry<string | null>("brought-desk-draft", null, scope);
  const canTake = me.role === "医師" || me.role === "看護師";

  const fromPhotos = (r: PhotoRead) => {
    setRows([...rows, ...r.rows.map((x) => ({ ...x, match: matchOral(x.said, x.strength), checked: false, decision: null as BroughtRow["decision"] }))]);
    setNotRead([...notRead, ...r.notRead]);
    setScanIds([...scanIds, ...onPhotos(r.pages)]);
  };
  const clear = () => {
    setRows([]);
    setScanIds([]);
    setNotRead([]);
    setDraftId(null);
  };
  const mine = [...reports].reverse();

  return (
    <div className="space-y-3 text-[13px]">
      {canTake && (
        <section className="space-y-2 rounded-md border border-rule bg-paper p-3">
          <NotebookCapture onRead={fromPhotos} />
          {rows.length > 0 && (
            <>
              <BroughtLinesTable lines={broughtLines(rows)} decisions={false} />
              {notRead.length > 0 && (
                <ul className="text-[12px] text-yamabuki">
                  {notRead.map((x, i) => (
                    <li key={i}>
                      読めなかった行：{displayText(x.text)}（{displayText(x.reason)}）
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onDraft({ patientId, rows, scanIds, ...(draftId ? { draftId } : {}) });
                    clear();
                  }}
                  className="rounded bg-ai px-3 py-1.5 font-bold text-white"
                >
                  薬剤師へ回す（{rows.length}剤）
                </button>
                <button type="button" onClick={clear} className="rounded px-2 py-1 text-ink-soft hover:text-shu">
                  やめる
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {mine.length > 0 && (
        <section>
          <ul className="space-y-1.5">
            {mine.map((r) => (
              <li key={r.id} className="rounded border border-rule-soft bg-sheet px-2 py-1.5 text-[12px]">
                <div className="nums flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{r.takenBy?.at.time ?? r.at}</span>
                  <b className={r.status === "指示済" ? "text-wakatake" : "text-yamabuki"}>{STATUS[r.status]}</b>
                  <span>{r.rows.length}剤</span>
                  <span className="text-ink-soft">{displayText(r.status === "鑑別中" ? r.by : `${r.takenBy ? `取込 ${r.takenBy.name}・` : ""}鑑別 ${r.by}`)}</span>
                  {(r.scanIds ?? []).map((id, i) => (
                    <button key={id} type="button" onClick={() => onOpenPhoto(id)} className="rounded border border-rule px-1.5 text-ink-soft hover:border-ai hover:text-ai">
                      お薬手帳{(r.scanIds ?? []).length > 1 ? ` ${i + 1}` : ""}
                    </button>
                  ))}
                  {canTake && r.status === "鑑別中" && (
                    <button
                      type="button"
                      disabled={draftId === r.id}
                      onClick={() => {
                        setRows(r.rows);
                        setScanIds(r.scanIds ?? []);
                        setNotRead([]);
                        setDraftId(r.id);
                      }}
                      className="ml-auto rounded border border-rule px-1.5 hover:border-ai hover:text-ai disabled:opacity-40"
                    >
                      開く
                    </button>
                  )}
                </div>
                {r.status === "鑑別中" && <p className="truncate text-ink-soft">{r.rows.map((x) => `${x.said} ${x.strength}`.trim()).join("、")}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
